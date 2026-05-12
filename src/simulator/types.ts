// Core types for the Tomasulo simulator. Pure data, no React.

export type Opcode =
  | "LOAD"
  | "STORE"
  | "BEQ"
  | "CALL"
  | "RET"
  | "ADD"
  | "SUB"
  | "AND"
  | "MUL";

export type RegId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type RsId = string; // e.g. "Load1", "Add3"

export type FuClass = "LOAD" | "STORE" | "BEQ" | "CALLRET" | "ADDSUB" | "AND" | "MUL";

export interface Instruction {
  // Static index in the source program (program-counter target).
  pc: number;
  lineNumber: number;
  opcode: Opcode;
  // Destination register for register-writing ops (LOAD, ADD/SUB/AND/MUL).
  rA?: RegId;
  // Source register or, for STORE, the value source register.
  rB?: RegId;
  // Second source for arithmetic; second compare reg for BEQ.
  rC?: RegId;
  // Signed offset / immediate (for LOAD, STORE, BEQ).
  offset?: number;
  // Signed call target (CALL only).
  callOffset?: number;
  // Original source line for display.
  text: string;
}

export type Stage = "ISSUED" | "EXECUTING" | "EXEC_DONE" | "WRITING" | "DONE";

export interface ReservationStation {
  id: RsId;
  fuClass: FuClass;
  busy: boolean;
  seqId: number | null;
  op: Opcode | null;
  Vj: number | null;
  Vk: number | null;
  Qj: RsId | null;
  Qk: RsId | null;
  // Address (LOAD/STORE) or branch target (BEQ) once computed.
  A: number | null;
  // For LOAD/STORE: the offset captured at issue (for address computation).
  offset: number | null;
  destReg: RegId | null;
  stage: Stage;
  remainingExec: number;
  remainingWrite: number;
  // seqId of the BEQ/CALL whose path this RS belongs to (for flush).
  issuePc: number | null;
  // Static instruction reference for display + trace.
  instrText: string | null;
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeCycle: number | null;
}

export type TraceStatus = "ISSUED" | "EXECUTING" | "WRITTEN" | "DONE" | "FLUSHED";

export interface TraceRow {
  seqId: number;
  pc: number;
  text: string;
  opcode: Opcode;
  issueCycle: number | null;
  execStartCycle: number | null;
  execEndCycle: number | null;
  writeCycle: number | null;
  status: TraceStatus;
}

export interface RegisterStatusEntry {
  tag: RsId | null;
}

export interface SimMetrics {
  cyclesElapsed: number;
  instructionsCompleted: number;
  branchesEncountered: number;
  branchesMispredicted: number;
}

export interface FinalMetrics extends SimMetrics {
  totalCycles: number;
  ipc: number;
  mispredictionPercentage: number;
}

export interface SimState {
  cycle: number;
  pc: number;
  registers: number[]; // length 8, 16-bit values
  registerStatus: RegisterStatusEntry[]; // length 8
  reservationStations: ReservationStation[];
  // Sparse memory map: 16-bit address → 16-bit value.
  memory: Record<number, number>;
  instructionQueue: Instruction[];
  outputTrace: TraceRow[];
  metrics: SimMetrics;
  // RS ids that have finished execute and are waiting for the CDB.
  cdbWaitQueue: RsId[];
  // RS ids of in-flight LOADs/STOREs in program order.
  inOrderMemQueue: RsId[];
  retInFlight: boolean;
  callInFlight: boolean;
  halted: boolean;
  // RS ids whose Q/stage changed this cycle (for UI flash).
  recentlyChanged: RsId[];
}

export interface SimConfig {
  // Functional unit RS counts (per spec table).
  rsCounts: Record<FuClass, number>;
  // Execute-stage latencies (per spec table).
  execLatency: Record<Opcode, number>;
}

export const DEFAULT_CONFIG: SimConfig = {
  rsCounts: {
    LOAD: 2,
    STORE: 2,
    BEQ: 2,
    CALLRET: 1,
    ADDSUB: 4,
    AND: 2,
    MUL: 1,
  },
  execLatency: {
    LOAD: 2, // address-compute portion; memory phase = 6 cycles (separate)
    STORE: 2, // address-compute portion; memory write = 6 cycles
    BEQ: 1,
    CALL: 1,
    RET: 1,
    ADD: 2,
    SUB: 2,
    AND: 1,
    MUL: 8,
  },
};

export const MEM_PHASE_CYCLES = 6;

// Map opcode -> functional unit class.
export function fuClassOf(op: Opcode): FuClass {
  switch (op) {
    case "LOAD":
      return "LOAD";
    case "STORE":
      return "STORE";
    case "BEQ":
      return "BEQ";
    case "CALL":
    case "RET":
      return "CALLRET";
    case "ADD":
    case "SUB":
      return "ADDSUB";
    case "AND":
      return "AND";
    case "MUL":
      return "MUL";
  }
}

// Convert a 16-bit unsigned value to signed (-32768..32767).
export function toSigned16(v: number): number {
  v = v & 0xffff;
  return v & 0x8000 ? v - 0x10000 : v;
}

// Wrap to 16-bit unsigned.
export function toUnsigned16(v: number): number {
  return ((v % 0x10000) + 0x10000) % 0x10000;
}
