import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SimState } from "@/simulator/types";

interface Props {
  state: SimState;
}

export function RegisterStatusPanel({ state }: Props) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Register Status</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reg</TableHead>
              <TableHead>Tag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.registerStatus.map((rs, i) => (
              <TableRow key={i} className="font-mono">
                <TableCell className="font-semibold">R{i}</TableCell>
                <TableCell>
                  {rs.tag ? (
                    <span className="text-orange-500">{rs.tag}</span>
                  ) : (
                    <span className="text-muted-foreground">ready</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
