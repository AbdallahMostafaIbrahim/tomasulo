import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SimState } from "@/simulator/types";

interface Props {
  state: SimState;
}

function toSigned16(v: number): number {
  return v & 0x8000 ? v - 0x10000 : v;
}

export function MemoryPanel({ state }: Props) {
  const entries = Object.entries(state.memory)
    .map(([k, v]) => [Number(k), Number(v)] as const)
    .sort((a, b) => a[0] - b[0]);
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Memory ({entries.length} cells)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        {entries.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No memory cells written or initialized.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Addr</TableHead>
                <TableHead>Hex</TableHead>
                <TableHead>Unsigned</TableHead>
                <TableHead>Signed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(([addr, v]) => (
                <TableRow key={addr} className="font-mono">
                  <TableCell>{addr}</TableCell>
                  <TableCell>0x{v.toString(16).padStart(4, "0")}</TableCell>
                  <TableCell>{v}</TableCell>
                  <TableCell>{toSigned16(v)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
