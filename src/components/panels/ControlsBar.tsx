import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSimStore } from "@/store/simStore";
import { Play, Pause, ChevronLeft, ChevronRight, RotateCcw, FastForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ControlsBar() {
  const cursor = useSimStore((s) => s.cursor);
  const total = useSimStore((s) => s.snapshots.length);
  const halted = useSimStore((s) => {
    if (s.snapshots.length === 0) return false;
    return s.snapshots[s.cursor]?.halted ?? false;
  });
  const step = useSimStore((s) => s.step);
  const stepBack = useSimStore((s) => s.stepBack);
  const goto = useSimStore((s) => s.goto);
  const reset = useSimStore((s) => s.reset);
  const runToEnd = useSimStore((s) => s.runToEnd);
  const hasErrors = useSimStore((s) => s.parseErrors.length > 0);

  const [autoplaying, setAutoplaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!autoplaying) return;
    intervalRef.current = window.setInterval(() => {
      const st = useSimStore.getState();
      if (st.cursor >= st.snapshots.length - 1) {
        setAutoplaying(false);
        return;
      }
      st.step();
    }, 200);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [autoplaying]);

  const max = Math.max(0, total - 1);
  const cycleNum = total > 0 ? cursor : 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
        }}
        title="Reset to cycle 0"
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => stepBack()}
        disabled={cursor === 0 || total === 0}
        title="Step back one cycle"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="sm"
        onClick={() => step()}
        disabled={hasErrors || (total > 0 && cursor >= max)}
        title="Step forward one cycle"
      >
        Step <ChevronRight className="h-3.5 w-3.5 ml-1" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setAutoplaying((p) => !p)}
        disabled={hasErrors || total === 0 || cursor >= max}
        title="Auto-play through cycles"
      >
        {autoplaying ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
        {autoplaying ? "Pause" : "Play"}
      </Button>
      <Button
        size="sm"
        variant="default"
        onClick={() => {
          runToEnd();
        }}
        disabled={hasErrors}
        title="Simulate to completion"
      >
        <FastForward className="h-3.5 w-3.5 mr-1" /> Run
      </Button>

      <div className="flex-1 min-w-[180px] flex items-center gap-2 ml-2">
        <span className="text-xs font-mono whitespace-nowrap">
          Cycle {cycleNum} / {max}
        </span>
        <Slider
          min={0}
          max={Math.max(0, max)}
          step={1}
          value={[cursor]}
          onValueChange={(v) => goto(v[0])}
          disabled={total === 0}
          className="flex-1"
        />
        {halted && <span className="text-[10px] text-green-600 font-semibold">HALTED</span>}
      </div>
    </div>
  );
}
