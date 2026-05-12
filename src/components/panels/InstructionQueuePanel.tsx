import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SimState } from "@/simulator/types";
import { cn } from "@/lib/utils";

interface Props {
  state: SimState;
}

export function InstructionQueuePanel({ state }: Props) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Instruction Queue</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto flex-1">
        <div className="font-mono text-xs space-y-0.5">
          {state.instructionQueue.map((instr, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded",
                i === state.pc && "bg-primary/15 border border-primary/40 font-semibold",
                i < state.pc && "text-muted-foreground line-through",
              )}
            >
              <span className="text-muted-foreground w-6 tabular-nums">
                {i}:
              </span>
              <span className="flex-1">{instr.text}</span>
              {i === state.pc && <Badge variant="secondary">next</Badge>}
            </div>
          ))}
          {state.pc >= state.instructionQueue.length && (
            <div className="px-2 py-1 text-muted-foreground italic">
              ↳ end of program (PC = {state.pc})
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
