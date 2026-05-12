// Small utilities used across the simulator stages: operand lookup,
// RS allocation, address math, logging, trace updates, RS release.

import type {
  FuClass,
  RegId,
  ReservationStation,
  RsId,
  TraceRow,
} from "../types";
import { toUnsigned16 } from "../types";
import type { CoreState } from "./state";

export function readSrc(
  s: CoreState,
  reg: RegId,
): { value: number | null; tag: RsId | null } {
  if (reg === 0) return { value: 0, tag: null };
  const tag = s.registerStatus[reg].tag;
  if (tag) return { value: null, tag };
  return { value: s.registers[reg], tag: null };
}

export function findFreeRs(s: CoreState, cls: FuClass): RsId | null {
  for (const id of s.rsByClass[cls]) {
    if (!s.rss.get(id)!.busy) return id;
  }
  return null;
}

export function isAddressDone(r: ReservationStation): boolean {
  return r.A !== null;
}

export function markAddressDone(r: ReservationStation) {
  // Address = (Vj wraps to 16-bit) + offset, mod 2^16.
  const base = r.Vj ?? 0;
  const off = r.offset ?? 0;
  r.A = toUnsigned16(base + off);
}

export function setTrace(
  s: CoreState,
  seqId: number,
  patch: Partial<TraceRow>,
) {
  const existing = s.trace.get(seqId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    s.trace.set(seqId, {
      seqId,
      pc: 0,
      text: "",
      opcode: "ADD",
      issueCycle: null,
      execStartCycle: null,
      execEndCycle: null,
      writeCycle: null,
      status: "ISSUED",
      ...patch,
    });
  }
}

export function releaseRs(s: CoreState, r: ReservationStation) {
  r.stage = "DONE";
  r.busy = false;
  s.metrics.instructionsCompleted++;
}

// The Load Store Queue is `s.inOrderMemQueue`, a list of RS ids in program order. We use
// these helpers for address-calc ordering and load/store disambiguation.

// Any Load Store Queue entry strictly earlier than `entryIdx` whose address isn't ready yet.
export function anyEarlierAddrPending(
  s: CoreState,
  entryIndex: number,
): boolean {
  for (let i = 0; i < entryIndex; i++) {
    if (s.rss.get(s.inOrderMemQueue[i])!.A === null) return true;
  }
  return false;
}

// Any STORE earlier than `entryIdx` whose A equals `addr`.
export function anyEarlierStoreConflict(
  s: CoreState,
  entryIndex: number,
  addr: number,
): boolean {
  for (let i = 0; i < entryIndex; i++) {
    const r = s.rss.get(s.inOrderMemQueue[i])!;
    if (r.op === "STORE" && r.A === addr) return true;
  }
  return false;
}

// Any Load Store Queue entry (LOAD or STORE) earlier than `entryIdx` whose A equals `addr`.
export function anyEarlierMemConflict(
  s: CoreState,
  entryIndex: number,
  addr: number,
): boolean {
  for (let i = 0; i < entryIndex; i++) {
    if (s.rss.get(s.inOrderMemQueue[i])!.A === addr) return true;
  }
  return false;
}

// Single memory port: busy iff some Load Store Queue entry is in its memory phase.
export function memoryPortBusy(s: CoreState): boolean {
  for (const id of s.inOrderMemQueue) {
    const r = s.rss.get(id)!;
    // LOAD in 6-cycle memory-read phase: stage=EXECUTING with address already computed.
    if (r.op === "LOAD" && r.stage === "EXECUTING" && r.A !== null) return true;
    // STORE in 6-cycle memory-write phase: stage=WRITING.
    if (r.op === "STORE" && r.stage === "WRITING") return true;
  }
  return false;
}
