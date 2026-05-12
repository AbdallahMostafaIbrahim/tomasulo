import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SimState, ReservationStation, FuClass } from "@/simulator/types";
import { stageColorClass, stageLabel } from "./stage";
import { cn } from "@/lib/utils";

interface Props {
  state: SimState;
}

const CLASS_LABELS: Record<FuClass, string> = {
  LOAD: "LOAD",
  STORE: "STORE",
  BEQ: "BEQ",
  CALLRET: "CALL/RET",
  ADDSUB: "ADD/SUB",
  AND: "AND",
  MUL: "MUL",
};

function fmt(v: number | null): string {
  if (v === null) return "—";
  return String(v);
}

export function ReservationStationsPanel({ state }: Props) {
  const grouped = new Map<FuClass, ReservationStation[]>();
  for (const rs of state.reservationStations) {
    const arr = grouped.get(rs.fuClass) ?? [];
    arr.push(rs);
    grouped.set(rs.fuClass, arr);
  }

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Reservation Stations</CardTitle>
        <div className="flex gap-1 flex-wrap">
          <LegendChip cls="bg-stage-issued/40">Issued</LegendChip>
          <LegendChip cls="bg-stage-executing/50">Executing</LegendChip>
          <LegendChip cls="bg-stage-execdone/50">Exec Done</LegendChip>
          <LegendChip cls="bg-stage-writing/50">Writing</LegendChip>
          <LegendChip cls="bg-stage-done/50">Done</LegendChip>
        </div>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>RS</TableHead>
              <TableHead>Busy</TableHead>
              <TableHead>Op</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Vj</TableHead>
              <TableHead>Vk</TableHead>
              <TableHead>Qj</TableHead>
              <TableHead>Qk</TableHead>
              <TableHead>A</TableHead>
              <TableHead>seq</TableHead>
              <TableHead className="text-right">Rem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...grouped.entries()].map(([cls, rss]) => (
              <RsClassRows key={cls} cls={cls} rss={rss} state={state} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LegendChip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] font-normal border", cls)}>
      {children}
    </Badge>
  );
}

function RsClassRows({
  cls,
  rss,
  state,
}: {
  cls: FuClass;
  rss: ReservationStation[];
  state: SimState;
}) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={11} className="font-semibold text-[11px] uppercase tracking-wide">
          {CLASS_LABELS[cls]}
        </TableCell>
      </TableRow>
      {rss.map((r) => {
        const flash = state.recentlyChanged.includes(r.id);
        const Vj = r.Qj === null ? fmt(r.Vj) : "—";
        const Vk = r.Qk === null ? fmt(r.Vk) : "—";
        const Qj = r.Qj ?? "—";
        const Qk = r.Qk ?? "—";
        const rem = r.stage === "EXECUTING" ? r.remainingExec : r.stage === "WRITING" ? r.remainingWrite : 0;
        return (
          <TableRow
            key={r.id}
            className={cn(
              stageColorClass(r.stage, r.busy),
              flash && "animate-flash",
              "font-mono",
            )}
          >
            <TableCell className="font-semibold">{r.id}</TableCell>
            <TableCell>{r.busy ? "yes" : "—"}</TableCell>
            <TableCell>{r.op ?? "—"}</TableCell>
            <TableCell>{stageLabel(r.stage, r.busy)}</TableCell>
            <TableCell>{Vj}</TableCell>
            <TableCell>{Vk}</TableCell>
            <TableCell>{Qj}</TableCell>
            <TableCell>{Qk}</TableCell>
            <TableCell>{fmt(r.A)}</TableCell>
            <TableCell>{r.seqId ?? "—"}</TableCell>
            <TableCell className="text-right">{r.busy ? rem : "—"}</TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
