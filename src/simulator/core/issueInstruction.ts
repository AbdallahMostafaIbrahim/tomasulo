// Issue stage. Grab an RS, snapshot the source tags/values, claim the
// destination register's tag, and for branches/calls either advance the PC
// or stall issue until the op writes back.

import type { Instruction, RsId } from "../types";
import { toUnsigned16 } from "../types";
import type { CoreState } from "./state";
import { readSrc, setTrace } from "./helpers";

export function issueInstruction(
  s: CoreState,
  instr: Instruction,
  rsId: RsId,
) {
  const r = s.rss.get(rsId)!;
  const seqId = s.nextSeqId++;
  r.busy = true;
  r.seqId = seqId;
  r.op = instr.opcode;
  r.stage = "ISSUED";
  r.issuePc = instr.pc;
  r.instrText = instr.text;
  r.issueCycle = s.cycle;
  r.execStartCycle = null;
  r.execEndCycle = null;
  r.writeCycle = null;
  r.A = null;
  r.offset = instr.offset ?? null;
  r.destReg = null;
  r.Vj = null;
  r.Vk = null;
  r.Qj = null;
  r.Qk = null;
  r.remainingExec = 0;
  r.remainingWrite = 0;
  s.recentlyChanged.add(r.id);

  setTrace(s, seqId, {
    seqId,
    pc: instr.pc,
    text: instr.text,
    opcode: instr.opcode,
    issueCycle: s.cycle,
    status: "ISSUED",
  });

  switch (instr.opcode) {
    case "LOAD": {
      // rA = M[rB + offset]. Source: rB. Dest: rA.
      const src = readSrc(s, instr.rB!);
      r.Vj = src.value;
      r.Qj = src.tag;
      r.destReg = instr.rA!;
      if (instr.rA !== 0) s.registerStatus[instr.rA!].tag = rsId;
      s.inOrderMemQueue.push(rsId);
      s.pc++;
      break;
    }
    case "STORE": {
      // M[rB + offset] = rA. Sources: rA (value), rB (base). No dest reg.
      const baseSrc = readSrc(s, instr.rB!);
      const valSrc = readSrc(s, instr.rA!);
      r.Vj = baseSrc.value;
      r.Qj = baseSrc.tag;
      r.Vk = valSrc.value;
      r.Qk = valSrc.tag;
      r.destReg = null;
      s.inOrderMemQueue.push(rsId);
      s.pc++;
      break;
    }
    case "BEQ": {
      // Predict not-taken; PC advances to PC+1 immediately.
      const aSrc = readSrc(s, instr.rA!);
      const bSrc = readSrc(s, instr.rB!);
      r.Vj = aSrc.value;
      r.Qj = aSrc.tag;
      r.Vk = bSrc.value;
      r.Qk = bSrc.tag;
      r.destReg = null;
      s.pc++;
      break;
    }
    case "CALL": {
      // Stall further issue until CALL writes. Stash the target on r.A; it
      // gets applied to PC at write time, alongside the R1 = PC+1 CDB
      // broadcast. Target is PC-relative from the CALL itself: PC + offset
      // (so `CALL 0` is an infinite self-loop, `CALL -1` would be the
      // previous instruction). R1 still holds PC+1 so RET returns past the
      // CALL.
      r.destReg = 1;
      r.Vj = toUnsigned16(s.pc + 1);
      r.Qj = null;
      r.Qk = null;
      r.Vk = 0;
      r.A = toUnsigned16(s.pc + (instr.callOffset ?? 0));
      s.registerStatus[1].tag = rsId;
      s.callInFlight = true;
      s.callRsId = rsId;
      // PC does not advance.
      break;
    }
    case "RET": {
      // Stall further issue until RET writes.
      const r1Src = readSrc(s, 1);
      r.Vj = r1Src.value;
      r.Qj = r1Src.tag;
      r.destReg = null;
      s.retInFlight = true;
      s.retRsId = rsId;
      // PC does not advance.
      break;
    }
    case "ADD":
    case "SUB":
    case "AND":
    case "MUL": {
      const bSrc = readSrc(s, instr.rB!);
      const cSrc = readSrc(s, instr.rC!);
      r.Vj = bSrc.value;
      r.Qj = bSrc.tag;
      r.Vk = cSrc.value;
      r.Qk = cSrc.tag;
      r.destReg = instr.rA!;
      if (instr.rA !== 0) s.registerStatus[instr.rA!].tag = rsId;
      s.pc++;
      break;
    }
  }
}
