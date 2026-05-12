import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSimStore } from "@/store/simStore";
import { Trash2, Plus } from "lucide-react";

export function MemoryInitPanel() {
  const rows = useSimStore((s) => s.memoryInit);
  const addRow = useSimStore((s) => s.addMemoryRow);
  const updateRow = useSimStore((s) => s.updateMemoryRow);
  const removeRow = useSimStore((s) => s.removeMemoryRow);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Initial Memory</CardTitle>
        <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr,1fr,auto] gap-1 text-[10px] uppercase text-muted-foreground tracking-wide font-medium pb-1">
            <span>Address</span>
            <span>Value</span>
            <span></span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr,1fr,auto] gap-1">
              <Input
                value={row.address}
                onChange={(e) => updateRow(row.id, { address: e.target.value })}
                placeholder="0"
                className="h-7 text-xs font-mono"
              />
              <Input
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
                placeholder="0"
                className="h-7 text-xs font-mono"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRow(row.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
