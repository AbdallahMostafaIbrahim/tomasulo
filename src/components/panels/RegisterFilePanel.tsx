import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SimState } from "@/simulator/types";

interface Props {
  state: SimState;
}

function toSigned16(v: number): number {
  return v & 0x8000 ? v - 0x10000 : v;
}

export function RegisterFilePanel({ state }: Props) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Register File</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reg</TableHead>
              <TableHead>Unsigned</TableHead>
              <TableHead>Signed</TableHead>
              <TableHead>Hex</TableHead>
              <TableHead>Tag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.registers.map((v, i) => {
              const tag = state.registerStatus[i].tag;
              return (
                <TableRow key={i} className="font-mono">
                  <TableCell className="font-semibold">R{i}</TableCell>
                  <TableCell>{v}</TableCell>
                  <TableCell>{toSigned16(v)}</TableCell>
                  <TableCell>0x{v.toString(16).padStart(4, "0")}</TableCell>
                  <TableCell>
                    {tag ? <span className="text-orange-500">{tag}</span> : <span className="text-muted-foreground">ready</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
