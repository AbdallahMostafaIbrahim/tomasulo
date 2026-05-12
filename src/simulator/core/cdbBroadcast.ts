// The CDB-winning RS computes its result, drops it on the CDB, updates the
// register file, and any other RS that was waiting on this producer snoops
// the value off the bus.

import type { ReservationStation } from "../types";
import { toSigned16, toUnsigned16 } from "../types";
import type { CoreState } from "./state";
import { releaseRs, setTrace } from "./helpers";

export function cdbBroadcast(s: CoreState, r: ReservationStation) {
  const value = computeResult(s, r);
  r.writeCycle = s.cycle;
  r.stage = "WRITING";
  r.remainingWrite = 0; // already written this cycle
  s.recentlyChanged.add(r.id);

  // CALL: redirect PC and unblock issue. The R1 write below goes through the
  // normal CDB path (destReg = 1).
  if (r.op === "CALL") {
    s.pc = toUnsigned16(r.A!);
    s.callInFlight = false;
    s.callRsId = null;
  }

  // Always write the regfile. CDB arbitration picks lowest seqId first, so
  // older broadcasts land first and any younger writer comes later and just
  // overwrites. We only clear the tag if it still points at us; if some
  // younger instruction renamed the register, leave its tag alone so readers
  // keep waiting on the newest producer. That way if the younger renamer
  // gets flushed later, our value stays in the regfile (the textbook "drop
  // the older write" Tomasulo move breaks once the younger writer was just
  // speculative).
  if (r.destReg !== null && r.destReg !== 0) {
    s.registers[r.destReg] = toUnsigned16(value);
    if (s.registerStatus[r.destReg].tag === r.id) {
      s.registerStatus[r.destReg].tag = null;
    }
  }

  // Snoop: feed the value to other RSes waiting on this producer.
  for (const otherId of s.rsOrder) {
    const o = s.rss.get(otherId)!;
    if (!o.busy || o.id === r.id) continue;
    let changed = false;
    if (o.Qj === r.id) {
      o.Vj = value;
      o.Qj = null;
      changed = true;
    }
    if (o.Qk === r.id) {
      o.Vk = value;
      o.Qk = null;
      changed = true;
    }
    if (changed) s.recentlyChanged.add(o.id);
  }

  setTrace(s, r.seqId!, { writeCycle: s.cycle, status: "DONE" });
  releaseRs(s, r);
}

function computeResult(s: CoreState, r: ReservationStation): number {
  switch (r.op) {
    case "ADD":
      return toUnsigned16(toSigned16(r.Vj!) + toSigned16(r.Vk!));
    case "SUB":
      return toUnsigned16(toSigned16(r.Vj!) - toSigned16(r.Vk!));
    case "AND":
      return toUnsigned16(r.Vj!) & toUnsigned16(r.Vk!);
    case "MUL": {
      // Lower 16 bits of 32-bit product.
      const prod = (toUnsigned16(r.Vj!) * toUnsigned16(r.Vk!)) | 0;
      return toUnsigned16(prod);
    }
    case "LOAD": {
      const addr = r.A!;
      return s.memory.get(addr) ?? 0;
    }
    case "CALL":
      // Vj was preloaded with PC+1 at issue.
      return toUnsigned16(r.Vj!);
    default:
      return 0;
  }
}
