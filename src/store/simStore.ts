// Zustand store: holds snapshot timeline + cursor + form state.
//
// The simulator core is the deep module; this is a thin wrapper.

import { create } from "zustand";
import { simulate } from "@/simulator/core";
import { parseProgram, type ParseError } from "@/simulator/tokenizer";
import type { FinalMetrics, SimState } from "@/simulator/types";
import { SAMPLE_PROGRAMS } from "./samplePrograms";

export interface MemoryInitRow {
  id: string; // stable react key
  address: string;
  value: string;
}

interface SimStoreState {
  // Inputs
  programText: string;
  startPC: string;
  memoryInit: MemoryInitRow[];

  // Parse state
  parseErrors: ParseError[];

  // Simulation snapshots
  snapshots: SimState[];
  cursor: number;
  metrics: FinalMetrics | null;

  // Actions: form
  setProgramText: (s: string) => void;
  setStartPC: (s: string) => void;
  addMemoryRow: () => void;
  updateMemoryRow: (id: string, patch: Partial<MemoryInitRow>) => void;
  removeMemoryRow: (id: string) => void;

  // Actions: simulation control
  parseAndPrepare: () => void;
  runToEnd: () => void;
  step: () => void;
  stepBack: () => void;
  goto: (cursor: number) => void;
  reset: () => void;
  loadSample: (name: string) => void;

  // Helpers
  current: () => SimState | null;
}

let memRowId = 0;
const newRow = (a = "", v = ""): MemoryInitRow => ({
  id: `mr${++memRowId}`,
  address: a,
  value: v,
});

const SAMPLE_DEFAULT = SAMPLE_PROGRAMS[0];

function memoryRowsFromInit(init: Record<number, number>): MemoryInitRow[] {
  const entries = Object.entries(init).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  if (entries.length === 0) return [newRow()];
  return entries.map(([k, v]) => newRow(String(k), String(v)));
}

function dataInitFromRows(rows: MemoryInitRow[]): {
  init: Record<number, number>;
  errors: string[];
} {
  const init: Record<number, number> = {};
  const errors: string[] = [];
  for (const row of rows) {
    if (!row.address && !row.value) continue;
    const addr = parseSignedOrHex(row.address);
    const val = parseSignedOrHex(row.value);
    if (addr === null) {
      errors.push(`Invalid address "${row.address}"`);
      continue;
    }
    if (val === null) {
      errors.push(`Invalid value "${row.value}"`);
      continue;
    }
    init[((addr % 0x10000) + 0x10000) % 0x10000] = ((val % 0x10000) + 0x10000) % 0x10000;
  }
  return { init, errors };
}

function parseSignedOrHex(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  if (/^-?0[xX][0-9a-fA-F]+$/.test(t)) {
    const sign = t.startsWith("-") ? -1 : 1;
    return sign * parseInt(t.replace(/^-/, ""), 16);
  }
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

export const useSimStore = create<SimStoreState>((set, get) => ({
  programText: SAMPLE_DEFAULT.source,
  startPC: String(SAMPLE_DEFAULT.startPC),
  memoryInit: memoryRowsFromInit(SAMPLE_DEFAULT.dataInit),

  parseErrors: [],

  snapshots: [],
  cursor: 0,
  metrics: null,

  setProgramText: (s) => set({ programText: s, parseErrors: [], snapshots: [], metrics: null, cursor: 0 }),
  setStartPC: (s) => set({ startPC: s, snapshots: [], metrics: null, cursor: 0 }),

  addMemoryRow: () =>
    set((st) => ({ memoryInit: [...st.memoryInit, newRow()] })),
  updateMemoryRow: (id, patch) =>
    set((st) => ({
      memoryInit: st.memoryInit.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
      snapshots: [],
      metrics: null,
      cursor: 0,
    })),
  removeMemoryRow: (id) =>
    set((st) => ({
      memoryInit: st.memoryInit.filter((r) => r.id !== id),
    })),

  parseAndPrepare: () => {
    const st = get();
    const r = parseProgram(st.programText);
    if (!r.ok) {
      set({ parseErrors: r.errors, snapshots: [], metrics: null });
      return;
    }
    set({ parseErrors: [] });
  },

  runToEnd: () => {
    const st = get();
    const parsed = parseProgram(st.programText);
    if (!parsed.ok) {
      set({ parseErrors: parsed.errors });
      return;
    }
    const { init } = dataInitFromRows(st.memoryInit);
    const startPC = parseSignedOrHex(st.startPC) ?? 0;
    const out = simulate({
      program: parsed.instructions,
      dataInit: init,
      startPC,
    });
    set({
      parseErrors: [],
      snapshots: out.snapshots,
      metrics: out.metrics,
      cursor: out.snapshots.length - 1,
    });
  },

  step: () => {
    const st = get();
    if (st.snapshots.length === 0) {
      // Lazy-init: simulate to end, then move cursor to 1 (or as far as possible).
      get().runToEnd();
      const after = get();
      set({ cursor: Math.min(1, after.snapshots.length - 1) });
      return;
    }
    set({ cursor: Math.min(st.cursor + 1, st.snapshots.length - 1) });
  },

  stepBack: () => {
    const st = get();
    set({ cursor: Math.max(0, st.cursor - 1) });
  },

  goto: (n) => {
    const st = get();
    if (st.snapshots.length === 0) return;
    set({ cursor: Math.max(0, Math.min(n, st.snapshots.length - 1)) });
  },

  reset: () => set({ snapshots: [], metrics: null, cursor: 0 }),

  loadSample: (name) => {
    const sp = SAMPLE_PROGRAMS.find((p) => p.name === name);
    if (!sp) return;
    set({
      programText: sp.source,
      startPC: String(sp.startPC),
      memoryInit: memoryRowsFromInit(sp.dataInit),
      parseErrors: [],
      snapshots: [],
      metrics: null,
      cursor: 0,
    });
  },

  current: () => {
    const st = get();
    if (st.snapshots.length === 0) return null;
    return st.snapshots[st.cursor];
  },
}));
