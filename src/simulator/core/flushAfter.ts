// Toss out every RS younger than the given branch, clear any register-status
// tags pointing at them, and pull them out of the memory queue / CDB wait
// queue. Called when a BEQ resolves taken (we always predict not-taken).

import type { CoreState } from "./state";
import { makeRs } from "./state";

export function flushAfter(s: CoreState, branchSeqId: number) {
  for (const id of s.rsOrder) {
    const r = s.rss.get(id)!;
    if (!r.busy || r.seqId === null || r.seqId <= branchSeqId) continue;

    const tr = s.trace.get(r.seqId);
    if (tr) tr.status = "FLUSHED";

    s.inOrderMemQueue = s.inOrderMemQueue.filter((x) => x !== r.id);
    s.cdbWaitQueue = s.cdbWaitQueue.filter((x) => x !== r.id);

    for (const rs of s.registerStatus) {
      if (rs.tag === r.id) rs.tag = null;
    }
    if (s.retRsId === r.id) {
      s.retInFlight = false;
      s.retRsId = null;
    }
    if (s.callRsId === r.id) {
      s.callInFlight = false;
      s.callRsId = null;
    }

    Object.assign(r, makeRs(r.id, r.fuClass));
    s.recentlyChanged.add(r.id);
  }
}
