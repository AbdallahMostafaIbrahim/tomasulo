// Wrap up the write stage for the ops that don't use the CDB:
//   STORE: drop the buffered value into memory after the 6-cycle write phase.
//   BEQ:   settle the branch. If taken, flush younger instructions and redirect PC.
//   RET:   redirect PC to the saved return address and unblock issue.

import type { ReservationStation } from "../types";
import { toUnsigned16 } from "../types";
import type { CoreState } from "./state";
import { releaseRs, setTrace } from "./helpers";
import { flushAfter } from "./flushAfter";

export function commitWrite(s: CoreState, r: ReservationStation) {
  if (r.op === "STORE") {
    const addr = r.A!;
    const value = toUnsigned16(r.Vk!);
    s.memory.set(addr, value);
    r.writeCycle = s.cycle;
    s.inOrderMemQueue = s.inOrderMemQueue.filter((x) => x !== r.id);
    setTrace(s, r.seqId!, { writeCycle: s.cycle, status: "DONE" });
    s.recentlyChanged.add(r.id);
    releaseRs(s, r);
    return;
  }
  if (r.op === "BEQ") {
    r.writeCycle = s.cycle;
    s.metrics.branchesEncountered++;
    const taken = toUnsigned16(r.Vj!) === toUnsigned16(r.Vk!);
    setTrace(s, r.seqId!, { writeCycle: s.cycle, status: "DONE" });
    if (taken) {
      // Mispredicted: we predicted not-taken.
      s.metrics.branchesMispredicted++;
      const target = toUnsigned16(r.issuePc! + 1 + (r.offset ?? 0));
      flushAfter(s, r.seqId!);
      s.pc = target;
    }
    releaseRs(s, r);
    return;
  }
  if (r.op === "RET") {
    r.writeCycle = s.cycle;
    setTrace(s, r.seqId!, { writeCycle: s.cycle, status: "DONE" });
    const target = toUnsigned16(r.Vj!);
    s.pc = target;
    s.retInFlight = false;
    s.retRsId = null;
    releaseRs(s, r);
    return;
  }
  // Anything else writes via the CDB and goes through cdbBroadcast instead.
}
