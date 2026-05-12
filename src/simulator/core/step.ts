// One Tomasulo cycle. Five phases run in this order:
//   1. Write     run any pending writes (STORE commit, BEQ resolve, RET, CDB broadcast)
//   2. Execute   tick exec/write countdowns and move LOAD/STORE through the mem queue
//   3. Issue     try to issue the next instruction if there's a free RS
//   4. WakeReady RSes whose operands are now ready start executing next cycle
//   5. Halt?     if the PC is past the program and nothing's in flight, we're done
//
// Each phase has its own function below. step() just calls them in order.

import type { ReservationStation } from "../types";
import { MEM_PHASE_CYCLES, fuClassOf } from "../types";
import type { CoreState } from "./state";
import {
  anyEarlierAddrPending,
  anyEarlierMemConflict,
  anyEarlierStoreConflict,
  findFreeRs,
  isAddressDone,
  markAddressDone,
  memoryPortBusy,
  setTrace,
} from "./helpers";
import { cdbBroadcast } from "./cdbBroadcast";
import { commitWrite } from "./commitWrite";
import { issueInstruction } from "./issueInstruction";

const LOAD_MEM_CYCLES = MEM_PHASE_CYCLES; // 6
const STORE_WRITE_PHASE_CYCLES = MEM_PHASE_CYCLES; // 6
const BRANCH_WRITE_CYCLES = 1; // BEQ, RET

export function step(s: CoreState): void {
  if (s.halted) return;
  s.cycle++;
  s.recentlyChanged = new Set();

  writeStage(s);
  executeStage(s);
  runMemoryPort(s);
  issueStage(s);
  wakeReadyRSes(s);
  checkIfHalted(s);
}

// Step 1: Write
// Tick the WRITING RSes, then run the CDB arbiter. Under our strict
// non-speculative policy nothing younger than an unresolved BEQ ever reaches
// WRITING or the CDB wait queue in the first place (the wake-up gate blocks
// it from executing), so no branch-aware filtering is needed here.

function writeStage(s: CoreState): void {
  tickWriters(s);
  broadcastNextResult(s);
}

// The oldest BEQ that hasn't resolved yet (writeCycle still null). Used by
// wakeReadyRSes to block any younger RS from transitioning ISSUED -> EXECUTING.
// That single gate enforces the "issued but not executed nor written" rule.
function oldestPendingBranch(s: CoreState): number | null {
  let min = Infinity;
  for (const r of s.rss.values()) {
    if (!r.busy || r.op !== "BEQ") continue;
    if (r.writeCycle !== null) continue;
    if (r.seqId !== null && r.seqId < min) min = r.seqId;
  }
  return min === Infinity ? null : min;
}

function broadcastNextResult(s: CoreState): void {
  if (s.cdbWaitQueue.length === 0) return;
  const winnerId = s.cdbWaitQueue.reduce((acc, id) => {
    const a = s.rss.get(acc)!.seqId!;
    const b = s.rss.get(id)!.seqId!;
    return b < a ? id : acc;
  });
  const winner = s.rss.get(winnerId)!;
  s.cdbWaitQueue = s.cdbWaitQueue.filter((id) => id !== winnerId);
  cdbBroadcast(s, winner);
}

function tickWriters(s: CoreState): void {
  for (const id of s.rsOrder) {
    const r = s.rss.get(id)!;
    if (!r.busy || r.stage !== "WRITING") continue;
    r.remainingWrite -= 1;
    if (r.remainingWrite > 0) continue;
    commitWrite(s, r);
  }
}

// Step 2: Execute
// Tick remainingExec for every EXECUTING RS. When it hits 0, transition:
//   LOAD: first phase finishes -> address done, wait in mem queue;
//         second phase finishes -> memory read done, queue for CDB.
//   STORE: phase finishes -> address done, wait in mem queue.
//   BEQ/RET: go into their 1-cycle WRITING phase (no CDB).
//   ALU (ADD/SUB/AND/MUL/CALL): queue for CDB.

function executeStage(s: CoreState): void {
  for (const id of s.rsOrder) {
    const r = s.rss.get(id)!;
    if (!r.busy || r.stage !== "EXECUTING") continue;
    r.remainingExec -= 1;
    if (r.remainingExec > 0) continue;

    if (r.op === "LOAD") {
      finishLoadExecPhase(s, r);
    } else if (r.op === "STORE") {
      finishStoreExecPhase(s, r);
    } else if (r.op === "BEQ" || r.op === "RET") {
      finishBranchOrRetExec(s, r);
    } else {
      finishAluExec(s, r);
    }
  }
}

function finishLoadExecPhase(s: CoreState, r: ReservationStation): void {
  if (!isAddressDone(r)) {
    // first phase: address compute just finished
    markAddressDone(r);
    r.stage = "EXEC_DONE";
    s.recentlyChanged.add(r.id);
  } else {
    // second phase: memory read finished
    r.execEndCycle = s.cycle;
    r.stage = "EXEC_DONE";
    s.cdbWaitQueue.push(r.id);
    s.inOrderMemQueue = s.inOrderMemQueue.filter((x) => x !== r.id);
    s.recentlyChanged.add(r.id);
    setTrace(s, r.seqId!, { execEndCycle: s.cycle, status: "EXECUTING" });
  }
}

function finishStoreExecPhase(s: CoreState, r: ReservationStation): void {
  if (isAddressDone(r)) return;
  markAddressDone(r);
  r.execEndCycle = s.cycle;
  setTrace(s, r.seqId!, { execEndCycle: s.cycle, status: "EXECUTING" });
  r.stage = "EXEC_DONE";
  s.recentlyChanged.add(r.id);
}

function finishBranchOrRetExec(s: CoreState, r: ReservationStation): void {
  r.execEndCycle = s.cycle;
  setTrace(s, r.seqId!, { execEndCycle: s.cycle, status: "EXECUTING" });
  r.stage = "WRITING";
  r.remainingWrite = BRANCH_WRITE_CYCLES;
  s.recentlyChanged.add(r.id);
}

function finishAluExec(s: CoreState, r: ReservationStation): void {
  r.execEndCycle = s.cycle;
  setTrace(s, r.seqId!, { execEndCycle: s.cycle, status: "EXECUTING" });
  r.stage = "EXEC_DONE";
  s.cdbWaitQueue.push(r.id);
  s.recentlyChanged.add(r.id);
}

// Step 2b: hand out the single memory port
// We've only got one memory port. Each cycle, if it's free, walk the Load Store Queue in
// program order and pick the oldest entry that's:
//   - address-ready (stage=EXEC_DONE, A != null)
//   - not already in its memory phase
//   - for LOAD: no earlier STORE shares the same address
//   - for STORE: value operand resolved (Qk null) AND no earlier Load Store Queue entry shares
//     the address (load-store, store-load, store-store all conflict)

function runMemoryPort(s: CoreState): void {
  if (s.inOrderMemQueue.length === 0) return;
  if (memoryPortBusy(s)) return;

  for (let i = 0; i < s.inOrderMemQueue.length; i++) {
    const entry = s.rss.get(s.inOrderMemQueue[i])!;
    if (entry.stage !== "EXEC_DONE" || entry.A === null) continue;

    if (entry.op === "LOAD") {
      if (entry.execEndCycle !== null) continue; // mem read already done, waiting on CDB
      if (anyEarlierStoreConflict(s, i, entry.A)) continue;
      entry.stage = "EXECUTING";
      entry.remainingExec = LOAD_MEM_CYCLES;
      s.recentlyChanged.add(entry.id);
      return;
    }
    if (entry.op === "STORE") {
      if (entry.writeCycle !== null) continue; // already wrote
      if (entry.Qk !== null) continue; // value not ready yet
      if (anyEarlierMemConflict(s, i, entry.A)) continue;
      entry.stage = "WRITING";
      entry.remainingWrite = STORE_WRITE_PHASE_CYCLES;
      s.recentlyChanged.add(entry.id);
      return;
    }
  }
}

// Step 3: Issue
// Issue the next instruction if RET/CALL isn't blocking us and there's a free RS
// for the right unit.

function issueStage(s: CoreState): void {
  if (s.retInFlight) return;
  if (s.callInFlight) return;
  if (s.pc >= s.program.length) return;

  const instr = s.program[s.pc];
  const cls = fuClassOf(instr.opcode);
  const free = findFreeRs(s, cls);
  if (free) issueInstruction(s, instr, free);
}

// Step 4: wake any RSes that just became ready

function wakeReadyRSes(s: CoreState): void {
  const oldBranch = oldestPendingBranch(s);
  for (const id of s.rsOrder) {
    const r = s.rss.get(id)!;
    if (!r.busy || r.stage !== "ISSUED") continue;

    if (oldBranch !== null && r.seqId! > oldBranch) continue;

    const isLsq = r.op === "LOAD" || r.op === "STORE";
    if (isLsq) {
      if (r.Qj !== null) continue; // base register not ready
      const idx = s.inOrderMemQueue.indexOf(r.id);
      if (idx < 0) continue; // shouldn't happen for LOAD/STORE
      if (anyEarlierAddrPending(s, idx)) continue; // wait for earlier addresses
    } else {
      if (r.Qj !== null || r.Qk !== null) continue;
    }

    r.stage = "EXECUTING";
    r.remainingExec = s.config.execLatency[r.op!];
    r.execStartCycle = s.cycle + 1;
    setTrace(s, r.seqId!, { execStartCycle: s.cycle + 1, status: "EXECUTING" });
    s.recentlyChanged.add(r.id);
  }
}

// Step 5: are we done?
// We halt when the PC is past the program and nothing is in flight anywhere.

function checkIfHalted(s: CoreState): void {
  s.metrics.cyclesElapsed = s.cycle;
  const allEmpty =
    [...s.rss.values()].every((r) => !r.busy) &&
    s.cdbWaitQueue.length === 0 &&
    s.inOrderMemQueue.length === 0;
  if (s.pc >= s.program.length && allEmpty) {
    s.halted = true;
  }
}
