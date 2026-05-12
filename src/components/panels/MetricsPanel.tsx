import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimState, FinalMetrics } from "@/simulator/types";

interface Props {
  state: SimState;
  metrics: FinalMetrics | null;
}

function ipcFromState(state: SimState): number {
  if (state.cycle === 0) return 0;
  const completed = state.outputTrace.filter((r) => r.status === "DONE").length;
  return completed / state.cycle;
}

function mpFromState(state: SimState): number {
  if (state.metrics.branchesEncountered === 0) return 0;
  return (state.metrics.branchesMispredicted / state.metrics.branchesEncountered) * 100;
}

export function MetricsPanel({ state, metrics }: Props) {
  const live = !metrics;
  const totalCycles = metrics?.totalCycles ?? state.cycle;
  const completed =
    metrics?.instructionsCompleted ??
    state.outputTrace.filter((r) => r.status === "DONE").length;
  const ipc = metrics?.ipc ?? ipcFromState(state);
  const branches = metrics?.branchesEncountered ?? state.metrics.branchesEncountered;
  const misp = metrics?.branchesMispredicted ?? state.metrics.branchesMispredicted;
  const mp = metrics?.mispredictionPercentage ?? mpFromState(state);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Metrics {live ? <span className="text-muted-foreground font-normal">(live)</span> : ""}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs font-mono">
          <Stat label="Cycles" value={totalCycles} />
          <Stat label="Done" value={completed} />
          <Stat label="IPC" value={ipc.toFixed(3)} />
          <Stat label="Branches" value={branches} />
          <Stat label="Mispred." value={misp} />
          <Stat label="Misp %" value={`${mp.toFixed(1)}%`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-base font-semibold">{value}</span>
    </div>
  );
}
