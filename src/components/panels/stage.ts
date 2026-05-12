import type { Stage } from "@/simulator/types";

export function stageColorClass(stage: Stage, busy: boolean): string {
  if (!busy) return "bg-muted/30 text-muted-foreground";
  switch (stage) {
    case "ISSUED":
      return "bg-stage-issued/30 dark:bg-stage-issued/40";
    case "EXECUTING":
      return "bg-stage-executing/40 dark:bg-stage-executing/50";
    case "EXEC_DONE":
      return "bg-stage-execdone/40 dark:bg-stage-execdone/50";
    case "WRITING":
      return "bg-stage-writing/40 dark:bg-stage-writing/50";
    case "DONE":
      return "bg-stage-done/40 dark:bg-stage-done/50";
  }
}

export function stageLabel(stage: Stage, busy: boolean): string {
  if (!busy) return "—";
  switch (stage) {
    case "ISSUED":
      return "Issued";
    case "EXECUTING":
      return "Executing";
    case "EXEC_DONE":
      return "Exec Done";
    case "WRITING":
      return "Writing";
    case "DONE":
      return "Done";
  }
}
