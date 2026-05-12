// Public API of the simulator.
//   simulate(input)        run to completion, return snapshots + metrics.
//   createSimulator(input) interactive: step()/current()/done()/snapshots().

import type { FinalMetrics, SimState } from "../types";
import type { CoreState, SimulateInput } from "./state";
import { freshState, snapshot } from "./state";
import { step } from "./step";

export type { SimulateInput } from "./state";

export interface SimulateOutput {
  snapshots: SimState[];
  metrics: FinalMetrics;
}

export function createSimulator(input: SimulateInput) {
  const state = freshState(input);
  const initial = snapshot(state);
  const snapshots: SimState[] = [initial];

  return {
    step(): SimState {
      step(state);
      const snap = snapshot(state);
      snapshots.push(snap);
      return snap;
    },
    current(): SimState {
      return snapshots[snapshots.length - 1];
    },
    done(): boolean {
      return state.halted;
    },
    metrics(): FinalMetrics {
      return finalizeMetrics(state);
    },
    snapshots(): SimState[] {
      return snapshots;
    },
  };
}

export function simulate(input: SimulateInput): SimulateOutput {
  const state = freshState(input);
  const snapshots: SimState[] = [snapshot(state)];
  const cap = input.maxCycles ?? 100_000;
  while (!state.halted && state.cycle < cap) {
    step(state);
    snapshots.push(snapshot(state));
  }
  return { snapshots, metrics: finalizeMetrics(state) };
}

function finalizeMetrics(s: CoreState): FinalMetrics {
  const totalCycles = s.cycle;
  const completed = [...s.trace.values()].filter(
    (r) => r.status === "DONE",
  ).length;
  const ipc = totalCycles > 0 ? completed / totalCycles : 0;
  const mp =
    s.metrics.branchesEncountered > 0
      ? (s.metrics.branchesMispredicted / s.metrics.branchesEncountered) * 100
      : 0;
  return {
    cyclesElapsed: totalCycles,
    instructionsCompleted: completed,
    branchesEncountered: s.metrics.branchesEncountered,
    branchesMispredicted: s.metrics.branchesMispredicted,
    totalCycles,
    ipc,
    mispredictionPercentage: mp,
  };
}
