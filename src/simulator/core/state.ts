// CoreState is the simulator's working memory.
// Constructors: makeRs (one RS), freshState (full state), snapshot (read-only copy).

import type {
  FuClass,
  Instruction,
  ReservationStation,
  RsId,
  SimConfig,
  SimState,
  TraceRow,
} from "../types";
import { DEFAULT_CONFIG, toUnsigned16 } from "../types";

export interface SimulateInput {
  program: Instruction[];
  dataInit?: Record<number, number>;
  startPC?: number;
  config?: Partial<SimConfig>;
  // Safety cap to prevent forever loops. Default 100k cycles.
  maxCycles?: number;
}

export interface CoreState {
  cycle: number;
  pc: number;
  registers: number[];
  registerStatus: { tag: RsId | null }[];
  rss: Map<RsId, ReservationStation>;
  // Stable order of RS ids, for deterministic iteration / display.
  rsOrder: RsId[];
  rsByClass: Record<FuClass, RsId[]>;
  memory: Map<number, number>;
  program: Instruction[];
  trace: Map<number, TraceRow>;
  metrics: {
    cyclesElapsed: number;
    instructionsCompleted: number;
    branchesEncountered: number;
    branchesMispredicted: number;
  };
  cdbWaitQueue: RsId[];
  inOrderMemQueue: RsId[];
  retInFlight: boolean;
  retRsId: RsId | null;
  callInFlight: boolean;
  callRsId: RsId | null;
  halted: boolean;
  recentlyChanged: Set<RsId>;
  nextSeqId: number;
  config: SimConfig;
}

export function makeRs(id: RsId, fuClass: FuClass): ReservationStation {
  return {
    id,
    fuClass,
    busy: false,
    seqId: null,
    op: null,
    Vj: null,
    Vk: null,
    Qj: null,
    Qk: null,
    A: null,
    offset: null,
    destReg: null,
    stage: "ISSUED",
    remainingExec: 0,
    remainingWrite: 0,
    issuePc: null,
    instrText: null,
    issueCycle: null,
    execStartCycle: null,
    execEndCycle: null,
    writeCycle: null,
  };
}

export function freshState(input: SimulateInput): CoreState {
  const config: SimConfig = {
    rsCounts: { ...DEFAULT_CONFIG.rsCounts, ...(input.config?.rsCounts ?? {}) },
    execLatency: {
      ...DEFAULT_CONFIG.execLatency,
      ...(input.config?.execLatency ?? {}),
    },
  };

  const rss = new Map<RsId, ReservationStation>();
  const rsOrder: RsId[] = [];
  const rsByClass: Record<FuClass, RsId[]> = {
    LOAD: [],
    STORE: [],
    BEQ: [],
    CALLRET: [],
    ADDSUB: [],
    AND: [],
    MUL: [],
  };
  const classLabel: Record<FuClass, string> = {
    LOAD: "Load",
    STORE: "Store",
    BEQ: "Beq",
    CALLRET: "CR",
    ADDSUB: "Add",
    AND: "And",
    MUL: "Mul",
  };
  for (const cls of Object.keys(rsByClass) as FuClass[]) {
    const n = config.rsCounts[cls];
    for (let i = 1; i <= n; i++) {
      const id = `${classLabel[cls]}${i}`;
      rss.set(id, makeRs(id, cls));
      rsOrder.push(id);
      rsByClass[cls].push(id);
    }
  }

  const memory = new Map<number, number>();
  if (input.dataInit) {
    for (const [k, v] of Object.entries(input.dataInit)) {
      const addr = toUnsigned16(Number(k));
      memory.set(addr, toUnsigned16(v));
    }
  }

  return {
    cycle: 0,
    pc: input.startPC ?? 0,
    registers: new Array(8).fill(0),
    registerStatus: Array.from({ length: 8 }, () => ({ tag: null })),
    rss,
    rsOrder,
    rsByClass,
    memory,
    program: input.program,
    trace: new Map(),
    metrics: {
      cyclesElapsed: 0,
      instructionsCompleted: 0,
      branchesEncountered: 0,
      branchesMispredicted: 0,
    },
    cdbWaitQueue: [],
    inOrderMemQueue: [],
    retInFlight: false,
    retRsId: null,
    callInFlight: false,
    callRsId: null,
    halted: false,
    recentlyChanged: new Set(),
    nextSeqId: 1,
    config,
  };
}

export function snapshot(s: CoreState): SimState {
  return {
    cycle: s.cycle,
    pc: s.pc,
    registers: [...s.registers],
    registerStatus: s.registerStatus.map((r) => ({ tag: r.tag })),
    reservationStations: s.rsOrder.map((id) => ({ ...s.rss.get(id)! })),
    memory: Object.fromEntries(s.memory),
    instructionQueue: s.program,
    outputTrace: [...s.trace.values()].sort((a, b) => a.seqId - b.seqId),
    metrics: { ...s.metrics },
    cdbWaitQueue: [...s.cdbWaitQueue],
    inOrderMemQueue: [...s.inOrderMemQueue],
    retInFlight: s.retInFlight,
    callInFlight: s.callInFlight,
    halted: s.halted,
    recentlyChanged: [...s.recentlyChanged],
  };
}
