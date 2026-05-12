import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SimState, TraceStatus } from "@/simulator/types";

interface Props {
  state: SimState;
}

function fmt(v: number | null): string {
  return v === null ? "—" : String(v);
}

function statusVariant(s: TraceStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "DONE":
      return "default";
    case "FLUSHED":
      return "destructive";
    case "ISSUED":
    case "EXECUTING":
    case "WRITTEN":
      return "secondary";
  }
}

export function OutputTracePanel({ state }: Props) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Output Trace ({state.outputTrace.length})</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        {state.outputTrace.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No instructions issued yet.
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>seq</TableHead>
                <TableHead>PC</TableHead>
                <TableHead>Instruction</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Start Exec</TableHead>
                <TableHead>End Exec</TableHead>
                <TableHead>Write</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.outputTrace.map((row) => {
                const flushed = row.status === "FLUSHED";
                return (
                  <TableRow key={row.seqId} className="font-mono">
                    <TableCell>{row.seqId}</TableCell>
                    <TableCell>{row.pc}</TableCell>
                    <TableCell>{row.text}</TableCell>
                    <TableCell>{fmt(row.issueCycle)}</TableCell>
                    <TableCell>{flushed ? "—" : fmt(row.execStartCycle)}</TableCell>
                    <TableCell>{flushed ? "—" : fmt(row.execEndCycle)}</TableCell>
                    <TableCell>{flushed ? "—" : fmt(row.writeCycle)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)} className="text-[10px]">
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
