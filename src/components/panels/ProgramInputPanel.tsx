import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSimStore } from "@/store/simStore";
import { SAMPLE_PROGRAMS } from "@/store/samplePrograms";
import { useEffect, useState } from "react";
import type { Opcode } from "@/simulator/types";

const OPCODES: Opcode[] = ["LOAD", "STORE", "BEQ", "CALL", "RET", "ADD", "SUB", "AND", "MUL"];

export function ProgramInputPanel() {
  const programText = useSimStore((s) => s.programText);
  const setProgramText = useSimStore((s) => s.setProgramText);
  const startPC = useSimStore((s) => s.startPC);
  const setStartPC = useSimStore((s) => s.setStartPC);
  const parseErrors = useSimStore((s) => s.parseErrors);
  const parseAndPrepare = useSimStore((s) => s.parseAndPrepare);
  const loadSample = useSimStore((s) => s.loadSample);

  // Parse on every change to surface errors live.
  useEffect(() => {
    parseAndPrepare();
  }, [programText, parseAndPrepare]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Program</CardTitle>
        <Select onValueChange={(name) => loadSample(name)}>
          <SelectTrigger className="w-[160px] h-7 text-xs">
            <SelectValue placeholder="Load sample…" />
          </SelectTrigger>
          <SelectContent>
            {SAMPLE_PROGRAMS.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2">
          <Label htmlFor="startPC" className="whitespace-nowrap">Start PC:</Label>
          <Input
            id="startPC"
            value={startPC}
            onChange={(e) => setStartPC(e.target.value)}
            className="h-7 w-20 font-mono text-xs"
          />
        </div>
        <Textarea
          value={programText}
          onChange={(e) => setProgramText(e.target.value)}
          className="flex-1 text-xs resize-none"
          spellCheck={false}
        />
        <AddInstructionForm />
        {parseErrors.length > 0 && (
          <div className="rounded border border-destructive/50 bg-destructive/10 p-2 text-[11px] font-mono space-y-0.5 max-h-24 overflow-auto">
            {parseErrors.map((e, i) => (
              <div key={i} className="text-destructive">
                line {e.lineNumber}: {e.message}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddInstructionForm() {
  const programText = useSimStore((s) => s.programText);
  const setProgramText = useSimStore((s) => s.setProgramText);
  const [op, setOp] = useState<Opcode>("ADD");
  const [rA, setRA] = useState("R1");
  const [rB, setRB] = useState("R2");
  const [rC, setRC] = useState("R3");
  const [imm, setImm] = useState("0");

  const append = () => {
    let line = "";
    switch (op) {
      case "LOAD":
      case "STORE":
        line = `${op} ${rA}, ${imm}(${rB})`;
        break;
      case "BEQ":
        line = `BEQ ${rA}, ${rB}, ${imm}`;
        break;
      case "CALL":
        line = `CALL ${imm}`;
        break;
      case "RET":
        line = `RET`;
        break;
      case "ADD":
      case "SUB":
      case "AND":
      case "MUL":
        line = `${op} ${rA}, ${rB}, ${rC}`;
        break;
    }
    const newText = programText.trimEnd() + "\n" + line;
    setProgramText(newText);
  };

  return (
    <details className="rounded border bg-muted/30 px-2 py-1">
      <summary className="text-xs cursor-pointer select-none">+ Add instruction</summary>
      <div className="mt-2 grid grid-cols-2 gap-1 text-xs items-center">
        <Label>Opcode</Label>
        <Select value={op} onValueChange={(v) => setOp(v as Opcode)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPCODES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        {(op !== "RET" && op !== "CALL") && (
          <>
            <Label>rA / dest</Label>
            <RegPicker value={rA} onChange={setRA} />
          </>
        )}
        {(op === "ADD" || op === "SUB" || op === "AND" || op === "MUL" || op === "BEQ" || op === "LOAD" || op === "STORE") && (
          <>
            <Label>rB</Label>
            <RegPicker value={rB} onChange={setRB} />
          </>
        )}
        {(op === "ADD" || op === "SUB" || op === "AND" || op === "MUL" || op === "BEQ") && op !== "BEQ" && (
          <>
            <Label>rC</Label>
            <RegPicker value={rC} onChange={setRC} />
          </>
        )}
        {op === "BEQ" && (
          <>
            <Label>rC (rB compare)</Label>
            <RegPicker value={rC} onChange={setRC} />
          </>
        )}
        {(op === "LOAD" || op === "STORE" || op === "BEQ" || op === "CALL") && (
          <>
            <Label>{op === "CALL" ? "label" : "offset"}</Label>
            <Input value={imm} onChange={(e) => setImm(e.target.value)} className="h-7 text-xs font-mono" />
          </>
        )}
      </div>
      <Button size="sm" onClick={append} className="mt-2 h-7 text-xs w-full">Append</Button>
    </details>
  );
}

function RegPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <SelectItem key={i} value={`R${i}`}>R{i}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
