import React, { useState, useEffect, useRef, useMemo } from "react";
import { simulate } from "./simulator/core";
import { parseProgram } from "./simulator/tokenizer";
import { MEM_PHASE_CYCLES, DEFAULT_CONFIG } from "./simulator/types";
import type {
  FuClass,
  Opcode,
  ReservationStation,
  SimState,
} from "./simulator/types";
import { SAMPLE_PROGRAMS } from "./store/samplePrograms";

function formatMemoryInit(d: Record<number, number>): string {
  return Object.entries(d)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0])
    .map(([a, v]) => `${a}: ${v}`)
    .join("\n");
}

// ============================================================
//  Tomasulo schematic UI
//  Aesthetic: engineering CAD / oscilloscope. Monospaced, dark,
//  signal-colored buses. Boxes-and-pipes layout that follows the
//  classic Tomasulo data-flow diagram, adapted to the 16-bit RiSC ISA.
// ============================================================

const DEFAULT_SAMPLE = SAMPLE_PROGRAMS[0];

function parseMemoryInit(text: string): Record<number, number> {
  const out: Record<number, number> = {};
  for (const ln of text.split(/\r?\n/)) {
    const t = ln.replace(/;.*$/, "").trim();
    if (!t) continue;
    const m = /^(\S+)\s*[:=]\s*(\S+)$/.exec(t);
    if (!m) continue;
    const a = /^0x/i.test(m[1]) ? parseInt(m[1], 16) : parseInt(m[1], 10);
    const v = /^0x/i.test(m[2]) ? parseInt(m[2], 16) : parseInt(m[2], 10);
    if (Number.isFinite(a) && Number.isFinite(v)) out[a] = v;
  }
  return out;
}

// signal colors (oscilloscope-ish)
const C = {
  bg: "#0a0e12",
  panel: "#11171d",
  grid: "#1a2129",
  line: "#2a333d",
  text: "#c7d0d9",
  dim: "#5c6773",
  amber: "#ffb454", // operations bus
  cyan: "#73d0ff", // operand bus
  green: "#7fd962", // CDB / write-back
  magenta: "#f07178", // address / memory
  yellow: "#e6c068", // active execute
  blue: "#5ccfe6", // load
  purple: "#c792ea", // store
};

// We rely on the simulator's snapshot interface. To animate the CDB
// arrow on the cycle a broadcast happened, we infer it by diffing
// consecutive snapshots: a writeCycle landing on `state.cycle` for a
// CDB-using op (LOAD or ADDSUB/AND/MUL/CALL).
function inferCdbWinner(state: SimState | null): {
  id: string | null;
  value: number | null;
} {
  if (!state) return { id: null, value: null };
  for (const r of state.reservationStations) {
    if (
      r.writeCycle === state.cycle &&
      r.op &&
      ["LOAD", "ADD", "SUB", "AND", "MUL", "CALL"].includes(r.op)
    ) {
      return { id: r.id, value: null };
    }
  }
  return { id: null, value: null };
}

export default function App() {
  const [programText, setProgramText] = useState<string>(DEFAULT_SAMPLE.source);
  const [memoryText, setMemoryText] = useState<string>(formatMemoryInit(DEFAULT_SAMPLE.dataInit));
  const [startPC, setStartPC] = useState<string>(String(DEFAULT_SAMPLE.startPC));
  const [parseErr, setParseErr] = useState<
    { lineNumber: number; message: string }[] | null
  >(null);
  const [snapshots, setSnapshots] = useState<SimState[]>([]);
  const [cursor, setCursor] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(600);

  const run = () => {
    const p = parseProgram(programText);
    if (!p.ok) {
      setParseErr(p.errors);
      setSnapshots([]);
      setCursor(0);
      return;
    }
    setParseErr(null);
    const dataInit = parseMemoryInit(memoryText);
    const { snapshots: snaps } = simulate({
      program: p.instructions,
      dataInit,
      startPC: Number(startPC) || 0,
    });
    setSnapshots(snaps);
    setCursor(0);
    setPlaying(false);
  };

  const loadSample = (name: string) => {
    const sample = SAMPLE_PROGRAMS.find((s) => s.name === name);
    if (!sample) return;
    setProgramText(sample.source);
    setMemoryText(formatMemoryInit(sample.dataInit));
    setStartPC(String(sample.startPC));
    setParseErr(null);
    setSnapshots([]);
    setCursor(0);
    setPlaying(false);
  };

  // autorun once on mount
  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // play loop
  useEffect(() => {
    if (!playing) return;
    if (cursor >= snapshots.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(
      () => setCursor((c) => Math.min(c + 1, snapshots.length - 1)),
      speed,
    );
    return () => clearTimeout(t);
  }, [playing, cursor, snapshots.length, speed]);

  const state: SimState | null = snapshots[cursor] || null;
  const prevState: SimState | null = cursor > 0 ? snapshots[cursor - 1] : null;

  const rsByCls = useMemo(() => {
    const out: Record<FuClass, ReservationStation[]> = {
      LOAD: [],
      STORE: [],
      BEQ: [],
      CALLRET: [],
      ADDSUB: [],
      AND: [],
      MUL: [],
    };
    if (state)
      for (const r of state.reservationStations) out[r.fuClass].push(r);
    return out;
  }, [state]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily:
          '"JetBrains Mono","Fira Code","SF Mono",ui-monospace,monospace',
        fontSize: 11,
        padding: "14px 18px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap');
        .ft-title { font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; }
        .ft-blink { animation: ftblink 1s steps(2,end) infinite; }
        @keyframes ftblink { 50% { opacity: 0.2; } }
        .ft-flash { animation: ftflash 0.8s ease-out; }
        @keyframes ftflash {
          0% { background: ${C.green}33; box-shadow: 0 0 12px ${C.green}99 inset; }
          100% { background: transparent; box-shadow: none; }
        }
        .ft-btn { background:transparent; color:${C.text}; border:1px solid ${C.line};
          padding:5px 10px; font-family:inherit; font-size:11px; cursor:pointer;
          letter-spacing:0.04em; text-transform:uppercase; transition:all 0.15s; }
        .ft-btn:hover:not(:disabled) { border-color:${C.amber}; color:${C.amber}; }
        .ft-btn:disabled { opacity:0.3; cursor:not-allowed; }
        .ft-btn.primary { border-color:${C.amber}; color:${C.amber}; }
        .ft-btn.primary:hover { background:${C.amber}; color:${C.bg}; }
        .ft-input, .ft-textarea {
          background:${C.bg}; color:${C.text}; border:1px solid ${C.line};
          font-family:inherit; font-size:11px; padding:4px 6px; outline:none;
          transition:border-color 0.15s;
        }
        .ft-input:focus, .ft-textarea:focus { border-color:${C.amber}; }
        .ft-panel-title {
          font-size:9px; letter-spacing:0.15em; text-transform:uppercase;
          color:${C.dim}; padding:6px 10px; border-bottom:1px solid ${C.line};
          display:flex; justify-content:space-between; align-items:center;
        }
        .ft-panel {
          background:${C.panel}; border:1px solid ${C.line};
          display:flex; flex-direction:column;
        }
        .ft-corner-tl::before, .ft-corner-tr::before,
        .ft-corner-bl::before, .ft-corner-br::before {
          content:''; position:absolute; width:8px; height:8px;
          border-color:${C.amber}; border-style:solid; border-width:0;
        }
        .ft-corner-tl::before { top:-1px; left:-1px; border-top-width:1px; border-left-width:1px; }
        .ft-corner-tr::before { top:-1px; right:-1px; border-top-width:1px; border-right-width:1px; }
        .ft-corner-bl::before { bottom:-1px; left:-1px; border-bottom-width:1px; border-left-width:1px; }
        .ft-corner-br::before { bottom:-1px; right:-1px; border-bottom-width:1px; border-right-width:1px; }
        .ft-grid-bg {
          background-image:
            linear-gradient(${C.grid} 1px, transparent 1px),
            linear-gradient(90deg, ${C.grid} 1px, transparent 1px);
          background-size: 24px 24px;
        }
        input[type=range].ft-range { accent-color:${C.amber}; }
      `}</style>

      <Header />

      <Toolbar
        playing={playing}
        setPlaying={setPlaying}
        cursor={cursor}
        setCursor={setCursor}
        total={snapshots.length}
        speed={speed}
        setSpeed={setSpeed}
        run={run}
        state={state}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr 280px",
          gap: 10,
          marginTop: 10,
        }}
      >
        <LeftColumn
          programText={programText}
          setProgramText={setProgramText}
          memoryText={memoryText}
          setMemoryText={setMemoryText}
          startPC={startPC}
          setStartPC={setStartPC}
          parseErr={parseErr}
          state={state}
          loadSample={loadSample}
        />

        <Schematic state={state} prevState={prevState} rsByCls={rsByCls} />

        <RightColumn state={state} prevState={prevState} />
      </div>

      <TracePanel state={state} />
    </div>
  );
}

function Header() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 14,
        marginBottom: 10,
        borderBottom: `1px solid ${C.line}`,
        paddingBottom: 8,
      }}
    >
      <div
        className="ft-title"
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.04em",
        }}
      >
        <span style={{ color: C.amber }}>Tomasulo</span>
        <span style={{ color: C.text }}> simulator</span>
      </div>
      <div style={{ color: C.dim, fontSize: 10, letterSpacing: "0.08em" }}>
        NONSPECULATIVE, RISC-16
      </div>
    </div>
  );
}

interface ToolbarProps {
  playing: boolean;
  setPlaying: (b: boolean | ((b: boolean) => boolean)) => void;
  cursor: number;
  setCursor: (n: number | ((n: number) => number)) => void;
  total: number;
  speed: number;
  setSpeed: (n: number) => void;
  run: () => void;
  state: SimState | null;
}

function Toolbar({
  playing,
  setPlaying,
  cursor,
  setCursor,
  total,
  speed,
  setSpeed,
  run,
  state,
}: ToolbarProps) {
  const cycle = state?.cycle ?? 0;
  const halted = state?.halted ?? false;
  const max = Math.max(0, total - 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        background: C.panel,
        border: `1px solid ${C.line}`,
        position: "relative",
      }}
    >
      <button className="ft-btn primary" onClick={run}>
        ▶ Build & Run
      </button>
      <div style={{ width: 1, height: 18, background: C.line }} />
      <button
        className="ft-btn"
        onClick={() => {
          setPlaying(false);
          setCursor(0);
        }}
        disabled={!total}
      >
        ⏮ Reset
      </button>
      <button
        className="ft-btn"
        onClick={() => {
          setPlaying(false);
          setCursor((c) => Math.max(0, c - 1));
        }}
        disabled={!total || cursor === 0}
      >
        ◀ Back
      </button>
      <button
        className="ft-btn primary"
        onClick={() => {
          if (cursor >= max) return;
          setPlaying((p) => !p);
        }}
        disabled={!total || cursor >= max}
      >
        {playing ? "⏸ Pause" : "▶ Play"}
      </button>
      <button
        className="ft-btn"
        onClick={() => {
          setPlaying(false);
          setCursor((c) => Math.min(max, c + 1));
        }}
        disabled={!total || cursor >= max}
      >
        Step ▶
      </button>
      <button
        className="ft-btn"
        onClick={() => {
          setPlaying(false);
          setCursor(max);
        }}
        disabled={!total || cursor >= max}
      >
        ⏭ End
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginLeft: 8,
          flex: 1,
        }}
      >
        <span style={{ color: C.dim, fontSize: 9, letterSpacing: "0.1em" }}>
          CYCLE
        </span>
        <input
          type="range"
          className="ft-range"
          min={0}
          max={max}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(+e.target.value);
          }}
          style={{ flex: 1 }}
        />
        <div
          style={{
            color: C.amber,
            fontVariantNumeric: "tabular-nums",
            minWidth: 70,
            textAlign: "right",
          }}
        >
          {String(cycle).padStart(3, "0")}{" "}
          <span style={{ color: C.dim }}>/ {String(max).padStart(3, "0")}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: C.dim, fontSize: 9 }}>SPEED</span>
        <select
          className="ft-input"
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        >
          <option value={1200}>0.5×</option>
          <option value={600}>1×</option>
          <option value={300}>2×</option>
          <option value={120}>4×</option>
          <option value={50}>8×</option>
        </select>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 10,
          borderLeft: `1px solid ${C.line}`,
        }}
      >
        {halted ? (
          <span style={{ color: C.magenta }}>● HALTED</span>
        ) : playing ? (
          <span style={{ color: C.amber }} className="ft-blink">
            ● RUNNING
          </span>
        ) : (
          <span style={{ color: C.dim }}>○ STOPPED</span>
        )}
      </div>
    </div>
  );
}

interface LeftColumnProps {
  programText: string;
  setProgramText: (s: string) => void;
  memoryText: string;
  setMemoryText: (s: string) => void;
  startPC: string;
  setStartPC: (s: string) => void;
  parseErr: { lineNumber: number; message: string }[] | null;
  state: SimState | null;
  loadSample: (name: string) => void;
}

function LeftColumn({
  programText,
  setProgramText,
  memoryText,
  setMemoryText,
  startPC,
  setStartPC,
  parseErr,
  state,
  loadSample,
}: LeftColumnProps) {
  const [sampleSel, setSampleSel] = useState<string>("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Panel
        title="Program Source"
        subtitle={`${
          programText
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith(";")).length
        } INSTR`}
      >
        <div
          style={{
            padding: "6px 10px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: C.dim, fontSize: 9, letterSpacing: "0.1em" }}>
            SAMPLE
          </span>
          <select
            className="ft-input"
            value={sampleSel}
            onChange={(e) => setSampleSel(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          >
            <option value="">— pick —</option>
            {SAMPLE_PROGRAMS.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="ft-btn"
            disabled={!sampleSel}
            onClick={() => loadSample(sampleSel)}
          >
            Load
          </button>
        </div>
        <textarea
          className="ft-textarea"
          value={programText}
          onChange={(e) => setProgramText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 200,
            border: "none",
            resize: "none",
            background: C.bg,
            lineHeight: 1.55,
          }}
        />
        {parseErr && (
          <div
            style={{
              borderTop: `1px solid ${C.line}`,
              padding: "6px 10px",
              background: `${C.magenta}11`,
              color: C.magenta,
              fontSize: 10,
            }}
          >
            {parseErr.map((e) => (
              <div key={e.lineNumber}>
                line {e.lineNumber}: {e.message}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Instruction Queue" subtitle={state ? `PC=${state.pc}` : ""}>
        <InstructionQueue state={state} />
      </Panel>

      <Panel title="Memory Init" subtitle="addr: value">
        <textarea
          className="ft-textarea"
          value={memoryText}
          onChange={(e) => setMemoryText(e.target.value)}
          spellCheck={false}
          style={{
            minHeight: 80,
            border: "none",
            resize: "none",
            background: C.bg,
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            padding: "6px 10px",
            borderTop: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: C.dim }}>start PC</span>
          <input
            className="ft-input"
            value={startPC}
            onChange={(e) => setStartPC(e.target.value)}
            style={{ width: 60 }}
          />
        </div>
      </Panel>
    </div>
  );
}

interface PanelProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  flex?: number;
  style?: React.CSSProperties;
}
function Panel({ title, subtitle, children, flex, style }: PanelProps) {
  return (
    <div className="ft-panel" style={{ position: "relative", flex, ...style }}>
      <div className="ft-corner-tl" />
      <div className="ft-corner-tr" />
      <div className="ft-corner-bl" />
      <div className="ft-corner-br" />
      <div className="ft-panel-title">
        <span>{title}</span>
        {subtitle && (
          <span
            style={{
              color: C.amber,
              letterSpacing: 0,
              textTransform: "none",
              fontSize: 9,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InstructionQueue({ state }: { state: SimState | null }) {
  if (!state) return <div style={{ padding: 10, color: C.dim }}>—</div>;
  const q = state.instructionQueue;
  return (
    <div style={{ overflowY: "auto", maxHeight: 200 }}>
      {q.map((ins, i) => {
        const isPC = i === state.pc;
        const issued = state.outputTrace.find(
          (t) => t.pc === i && t.status !== "FLUSHED",
        );
        return (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              display: "flex",
              gap: 8,
              background: isPC ? `${C.amber}22` : "transparent",
              borderLeft: isPC
                ? `2px solid ${C.amber}`
                : "2px solid transparent",
              color: issued ? C.dim : C.text,
              textDecoration: issued ? "line-through" : "none",
            }}
          >
            <span
              style={{
                color: isPC ? C.amber : C.dim,
                width: 22,
                textAlign: "right",
              }}
            >
              {i.toString().padStart(2, "0")}
            </span>
            <span style={{ flex: 1, fontSize: 10.5 }}>{ins.text}</span>
            {isPC && (
              <span
                className="ft-blink"
                style={{ color: C.amber, fontSize: 9 }}
              >
                PC▸
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface SchematicProps {
  state: SimState | null;
  prevState: SimState | null;
  rsByCls: Record<FuClass, ReservationStation[]>;
}

function Schematic({ state, prevState, rsByCls }: SchematicProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const r = wrapRef.current;
    if (!r) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setW(e.contentRect.width);
    });
    ro.observe(r);
    return () => ro.disconnect();
  }, []);

  const H = 580;

  const cdb = inferCdbWinner(state);
  const cdbActive = cdb.id != null;
  const cdbKey = state ? `${state.cycle}-${cdb.id || "none"}` : "0";

  return (
    <div
      ref={wrapRef}
      className="ft-panel"
      style={{ position: "relative", minHeight: H + 40 }}
    >
      <div className="ft-corner-tl" />
      <div className="ft-corner-tr" />
      <div className="ft-corner-bl" />
      <div className="ft-corner-br" />
      <div className="ft-panel-title">
        <span>Tomasulo Datapath</span>
      </div>
      <div
        className="ft-grid-bg"
        style={{ position: "relative", height: H, overflow: "hidden" }}
      >
        <SchematicSVG
          W={W}
          H={H}
          state={state}
          prevState={prevState}
          rsByCls={rsByCls}
          cdbKey={cdbKey}
          cdbActive={cdbActive}
        />
      </div>
    </div>
  );
}

interface SchematicSVGProps extends SchematicProps {
  W: number;
  H: number;
  cdbKey: string;
  cdbActive: boolean;
}

function SchematicSVG({
  W,
  H,
  state,
  rsByCls,
  cdbKey,
  cdbActive,
}: SchematicSVGProps) {
  if (!state) return null;

  const G = {
    iq: { x: 20, y: 14, w: 220, h: 80 },
    regs: { x: W - 220, y: 14, w: 200, h: 130 },
    load: { x: 20, y: 130, w: 180, h: 120 },
    store: { x: 20, y: 265, w: 180, h: 120 },
    mem: { x: 60, y: 430, w: 120, h: 38 },

    addsub: { x: 230, y: 120, w: 200, h: 130 },
    and: { x: 230, y: 260, w: 200, h: 80 },
    mul: { x: 230, y: 350, w: 200, h: 60 },

    beq: { x: 445, y: 120, w: 210, h: 82 },
    callret: { x: 445, y: 240, w: 210, h: 55 },

    fuAddSub: { x: 255, y: 430, w: 150, h: 32 },
    fuAnd: { x: 425, y: 430, w: 90, h: 32 },
    fuMul: { x: 530, y: 430, w: 85, h: 32 },
    fuBeq: { x: 475, y: 210, w: 150, h: 22 },
    fuCallRet: { x: 475, y: 303, w: 150, h: 22 },
  };

  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <marker
          id="arr"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.line} />
        </marker>
        <marker
          id="arrAmber"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.amber} />
        </marker>
<marker
          id="arrGreen"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.green} />
        </marker>
        <marker
          id="arrMag"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C.magenta} />
        </marker>
      </defs>

      {/* ============ buses ============ */}
      <BusLine
        d={`M ${G.iq.x + G.iq.w / 2} ${G.iq.y + G.iq.h}
            L ${G.iq.x + G.iq.w / 2} ${G.iq.y + G.iq.h + 12}
            L ${G.addsub.x + G.addsub.w / 2} ${G.iq.y + G.iq.h + 12}
            L ${G.addsub.x + G.addsub.w / 2} ${G.addsub.y}`}
        color={C.amber}
        marker="arrAmber"
      />
      <BusLine
        d={`M ${G.iq.x + 30} ${G.iq.y + G.iq.h}
            L ${G.iq.x + 30} ${G.load.y - 6}
            L ${G.load.x + G.load.w / 2} ${G.load.y - 6}
            L ${G.load.x + G.load.w / 2} ${G.load.y}`}
        color={C.amber}
        marker="arrAmber"
      />
      <BusLine
        d={`M ${G.iq.x + G.iq.w} ${G.iq.y + G.iq.h / 2}
            L ${G.beq.x + G.beq.w / 2} ${G.iq.y + G.iq.h / 2}
            L ${G.beq.x + G.beq.w / 2} ${G.beq.y}`}
        color={C.amber}
        marker="arrAmber"
      />

      {/* RS → FU */}
      <BusLine
        d={`M ${G.addsub.x + G.addsub.w / 2} ${G.addsub.y + G.addsub.h}
            L ${G.fuAddSub.x + G.fuAddSub.w / 2} ${G.fuAddSub.y}`}
        color={C.line}
        marker="arr"
      />
      <BusLine
        d={`M ${G.and.x + G.and.w / 2} ${G.and.y + G.and.h}
            L ${G.and.x + G.and.w / 2} ${G.fuAnd.y - 8}
            L ${G.fuAnd.x + G.fuAnd.w / 2} ${G.fuAnd.y - 8}
            L ${G.fuAnd.x + G.fuAnd.w / 2} ${G.fuAnd.y}`}
        color={C.line}
        marker="arr"
      />
      <BusLine
        d={`M ${G.mul.x + G.mul.w / 2} ${G.mul.y + G.mul.h}
            L ${G.mul.x + G.mul.w / 2} ${G.fuMul.y - 6}
            L ${G.fuMul.x + G.fuMul.w / 2} ${G.fuMul.y - 6}
            L ${G.fuMul.x + G.fuMul.w / 2} ${G.fuMul.y}`}
        color={C.line}
        marker="arr"
      />
      <BusLine
        d={`M ${G.beq.x + G.beq.w / 2} ${G.beq.y + G.beq.h}
            L ${G.fuBeq.x + G.fuBeq.w / 2} ${G.fuBeq.y}`}
        color={C.line}
        marker="arr"
      />
      <BusLine
        d={`M ${G.callret.x + G.callret.w / 2} ${G.callret.y + G.callret.h}
            L ${G.fuCallRet.x + G.fuCallRet.w / 2} ${G.fuCallRet.y}`}
        color={C.line}
        marker="arr"
      />

      {/* address path */}
      <BusLine
        d={`M ${G.load.x + G.load.w / 2 - 10} ${G.load.y + G.load.h}
            L ${G.load.x + G.load.w / 2 - 10} ${G.mem.y - 6}
            L ${G.mem.x + G.mem.w / 2 - 15} ${G.mem.y - 6}
            L ${G.mem.x + G.mem.w / 2 - 15} ${G.mem.y}`}
        color={C.magenta}
        marker="arrMag"
      />
      <BusLine
        d={`M ${G.store.x + G.store.w / 2 + 10} ${G.store.y + G.store.h}
            L ${G.store.x + G.store.w / 2 + 10} ${G.mem.y - 6}
            L ${G.mem.x + G.mem.w / 2 + 15} ${G.mem.y - 6}
            L ${G.mem.x + G.mem.w / 2 + 15} ${G.mem.y}`}
        color={C.magenta}
        marker="arrMag"
      />

      <CDBLoop G={G} W={W} H={H} active={cdbActive} cdbKey={cdbKey} />

      {/* ============ boxes ============ */}
      <BoxLabel title="Instruction Queue" {...G.iq}>
        <IQContents state={state} />
      </BoxLabel>

      <BoxLabel title="Register File" {...G.regs}>
        <RegFileContents state={state} prevState={null} />
      </BoxLabel>

      <RsGroup
        title="Load Buffers"
        cls="LOAD"
        stations={rsByCls.LOAD}
        box={G.load}
        state={state}
      />
      <RsGroup
        title="Store Buffers"
        cls="STORE"
        stations={rsByCls.STORE}
        box={G.store}
        state={state}
      />
      <RsGroup
        title="Add / Sub RS"
        cls="ADDSUB"
        stations={rsByCls.ADDSUB}
        box={G.addsub}
        state={state}
      />
      <RsGroup
        title="And RS"
        cls="AND"
        stations={rsByCls.AND}
        box={G.and}
        state={state}
      />
      <RsGroup
        title="Mul RS"
        cls="MUL"
        stations={rsByCls.MUL}
        box={G.mul}
        state={state}
      />
      <RsGroup
        title="Beq RS"
        cls="BEQ"
        stations={rsByCls.BEQ}
        box={G.beq}
        state={state}
      />
      <RsGroup
        title="Call/Ret"
        cls="CALLRET"
        stations={rsByCls.CALLRET}
        box={G.callret}
        state={state}
      />

      <FuBlock
        title="Memory Unit"
        box={G.mem}
        active={isAnyActive(
          rsByCls.LOAD,
          rsByCls.STORE,
          (s) =>
            s.stage === "EXECUTING" ||
            (s.stage === "WRITING" && s.op === "STORE"),
        )}
      />
      <FuBlock
        title="Add/Sub Unit"
        box={G.fuAddSub}
        active={isAnyActive([], rsByCls.ADDSUB, (s) => s.stage === "EXECUTING")}
      />
      <FuBlock
        title="And Unit"
        box={G.fuAnd}
        active={isAnyActive([], rsByCls.AND, (s) => s.stage === "EXECUTING")}
      />
      <FuBlock
        title="Mul Unit"
        box={G.fuMul}
        active={isAnyActive([], rsByCls.MUL, (s) => s.stage === "EXECUTING")}
      />
      <FuBlock
        title="BR"
        box={G.fuBeq}
        active={isAnyActive([], rsByCls.BEQ, (s) => s.stage === "EXECUTING")}
      />
      <FuBlock
        title="CR"
        box={G.fuCallRet}
        active={isAnyActive(
          [],
          rsByCls.CALLRET,
          (s) => s.stage === "EXECUTING",
        )}
      />

      {/* PC + cycle indicators */}
      <g>
        <rect
          x={G.iq.x - 6}
          y={G.iq.y - 12}
          width={42}
          height={11}
          fill={C.bg}
          stroke={C.amber}
        />
        <text
          x={G.iq.x - 4}
          y={G.iq.y - 3.5}
          fill={C.amber}
          fontSize="9"
          fontFamily="inherit"
        >
          PC={state.pc}
        </text>
      </g>
      <g>
        <rect
          x={W / 2 - 50}
          y={H - 22}
          width={100}
          height={18}
          fill={C.bg}
          stroke={C.amber}
        />
        <text
          x={W / 2}
          y={H - 9}
          fill={C.amber}
          fontSize="10"
          fontFamily="inherit"
          textAnchor="middle"
        >
          CYCLE {String(state.cycle).padStart(3, "0")}
          {state.halted && <tspan fill={C.magenta}> ● HALT</tspan>}
        </text>
      </g>
    </svg>
  );
}

function isAnyActive(
  setA: ReservationStation[],
  setB: ReservationStation[],
  pred: (r: ReservationStation) => boolean,
): boolean {
  for (const s of setA) if (s.busy && pred(s)) return true;
  for (const s of setB) if (s.busy && pred(s)) return true;
  return false;
}

interface BusLineProps {
  d: string;
  color: string;
  marker?: string;
}
function BusLine({ d, color, marker }: BusLineProps) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1}
      markerEnd={`url(#${marker || "arr"})`}
      opacity={0.85}
    />
  );
}

interface CDBLoopProps {
  G: Record<string, { x: number; y: number; w: number; h: number }>;
  W: number;
  H: number;
  active: boolean;
  cdbKey: string;
}
function CDBLoop({ G, W, H, active }: CDBLoopProps) {
  const y = H - 44;
  const p = `
    M ${G.fuMul.x + G.fuMul.w} ${G.fuMul.y + G.fuMul.h / 2}
    L ${W - 30} ${G.fuMul.y + G.fuMul.h / 2}
    L ${W - 30} ${y}
    L 30 ${y}
    L 30 ${G.mem.y + G.mem.h / 2}
    L ${G.mem.x} ${G.mem.y + G.mem.h / 2}
    M ${G.fuAddSub.x + G.fuAddSub.w / 2} ${G.fuAddSub.y + G.fuAddSub.h}
    L ${G.fuAddSub.x + G.fuAddSub.w / 2} ${y}
    M ${G.fuAnd.x + G.fuAnd.w / 2} ${G.fuAnd.y + G.fuAnd.h}
    L ${G.fuAnd.x + G.fuAnd.w / 2} ${y}
    M ${G.fuMul.x + G.fuMul.w / 2} ${G.fuMul.y + G.fuMul.h}
    L ${G.fuMul.x + G.fuMul.w / 2} ${y}
    M ${G.mem.x + G.mem.w / 2} ${G.mem.y + G.mem.h}
    L ${G.mem.x + G.mem.w / 2} ${y}
    M ${G.fuBeq.x + G.fuBeq.w} ${G.fuBeq.y + G.fuBeq.h / 2}
    L ${W - 30} ${G.fuBeq.y + G.fuBeq.h / 2}
    M ${G.fuCallRet.x + G.fuCallRet.w} ${G.fuCallRet.y + G.fuCallRet.h / 2}
    L ${W - 30} ${G.fuCallRet.y + G.fuCallRet.h / 2}
    M ${W - 30} ${G.beq.y + G.beq.h / 2}
    L ${G.beq.x + G.beq.w} ${G.beq.y + G.beq.h / 2}
    M ${W - 30} ${G.callret.y + G.callret.h / 2}
    L ${G.callret.x + G.callret.w} ${G.callret.y + G.callret.h / 2}
    M ${W - 30} ${y}
    L ${W - 30} ${G.regs.y + G.regs.h / 2}
    L ${G.regs.x + G.regs.w} ${G.regs.y + G.regs.h / 2}
  `;
  return (
    <g>
      <path
        d={p}
        fill="none"
        stroke={active ? C.green : `${C.green}55`}
        strokeWidth={active ? 2.5 : 1.5}
        style={{
          transition: "all 0.3s ease-out",
          filter: active ? `drop-shadow(0 0 5px ${C.green})` : "none",
        }}
      />
      <text
        x={W / 2}
        y={y - 4}
        fill={active ? C.green : `${C.green}99`}
        fontSize="9"
        fontFamily="inherit"
        textAnchor="middle"
        letterSpacing="2"
      >
        ───── COMMON DATA BUS {active && "● ACTIVE"} ─────
      </text>
    </g>
  );
}

interface BoxLabelProps {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: React.ReactNode;
}
function BoxLabel({ title, x, y, w, h, children }: BoxLabelProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.panel} stroke={C.line} />
      <text
        x={x + 6}
        y={y + 11}
        fill={C.dim}
        fontSize="8"
        fontFamily="inherit"
        letterSpacing="1.5"
      >
        {title.toUpperCase()}
      </text>
      <line x1={x} y1={y + 16} x2={x + w} y2={y + 16} stroke={C.line} />
      <foreignObject x={x} y={y + 18} width={w} height={h - 18}>
        {children}
      </foreignObject>
    </g>
  );
}

function IQContents({ state }: { state: SimState }) {
  const q = state.instructionQueue;
  const visible = q.slice(Math.max(0, state.pc - 1), state.pc + 3);
  return (
    <div
      style={{
        padding: "2px 6px",
        fontSize: 9.5,
        color: C.text,
        lineHeight: 1.45,
        fontFamily: "inherit",
      }}
    >
      {q.length === 0 && (
        <div style={{ color: C.dim, fontStyle: "italic" }}>empty</div>
      )}
      {visible.map((ins) => {
        const real = q.indexOf(ins);
        const isPC = real === state.pc;
        return (
          <div
            key={real}
            style={{
              color: isPC ? C.amber : real < state.pc ? C.dim : C.text,
              display: "flex",
              gap: 6,
            }}
          >
            <span style={{ color: C.dim, width: 18, textAlign: "right" }}>
              {real.toString().padStart(2, "0")}
            </span>
            <span
              style={{
                flex: 1,
                textDecoration: real < state.pc ? "line-through" : "none",
              }}
            >
              {ins.text.slice(0, 28)}
            </span>
            {isPC && <span style={{ color: C.amber }}>◀</span>}
          </div>
        );
      })}
      {state.pc + 3 < q.length && <div style={{ color: C.dim }}>…</div>}
    </div>
  );
}

function RegFileContents({
  state,
  prevState,
}: {
  state: SimState;
  prevState: SimState | null;
}) {
  return (
    <div style={{ padding: "2px 6px", fontSize: 9.5, fontFamily: "inherit" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 8,
        }}
      >
        {state.registers.map((v, i) => {
          const tag = state.registerStatus[i].tag;
          const changed = prevState && prevState.registers[i] !== v;
          return (
            <div
              key={i}
              className={changed ? "ft-flash" : ""}
              style={{
                display: "flex",
                gap: 4,
                padding: "1px 3px",
                borderBottom: `1px solid ${C.grid}`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ color: C.dim, width: 18 }}>R{i}</span>
              <span
                style={{
                  flex: 1,
                  textAlign: "right",
                  color: tag ? C.dim : C.text,
                }}
              >
                {v}
              </span>
              {tag && (
                <span style={{ color: C.yellow, fontSize: 8.5 }}>«{tag}»</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RsGroupProps {
  title: string;
  cls: FuClass;
  stations: ReservationStation[];
  box: { x: number; y: number; w: number; h: number };
  state: SimState;
}
function RsGroup({ title, cls, stations, box, state }: RsGroupProps) {
  const stationColor: Record<FuClass, string> = {
    LOAD: C.blue,
    STORE: C.purple,
    ADDSUB: C.text,
    AND: C.text,
    MUL: C.text,
    BEQ: C.magenta,
    CALLRET: C.magenta,
  };
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill={C.panel}
        stroke={C.line}
      />
      <text
        x={box.x + 6}
        y={box.y + 11}
        fill={stationColor[cls]}
        fontSize="8.5"
        fontFamily="inherit"
        letterSpacing="1.5"
      >
        {title.toUpperCase()} <tspan fill={C.dim}>· {stations.length}</tspan>
      </text>
      <line
        x1={box.x}
        y1={box.y + 16}
        x2={box.x + box.w}
        y2={box.y + 16}
        stroke={C.line}
      />
      <foreignObject x={box.x} y={box.y + 18} width={box.w} height={box.h - 18}>
        <div
          style={{
            padding: "2px 4px 0",
            fontSize: 9,
            fontFamily: "inherit",
            lineHeight: 1.25,
            color: C.text,
          }}
        >
          {stations.map((rs) => (
            <RsRow key={rs.id} rs={rs} cls={cls} state={state} />
          ))}
        </div>
      </foreignObject>
    </g>
  );
}

function RsRow({
  rs,
  cls,
  state,
}: {
  rs: ReservationStation;
  cls: FuClass;
  state: SimState;
}) {
  const flash = state.recentlyChanged?.includes(rs.id);
  const awaitingMem =
    rs.stage === "EXEC_DONE" && state.inOrderMemQueue.includes(rs.id);
  const stageColor: Record<string, string> = {
    ISSUED: C.dim,
    EXECUTING: C.yellow,
    EXEC_DONE: C.amber,
    WRITING: C.green,
    DONE: C.dim,
  };
  const color = awaitingMem ? C.magenta : stageColor[rs.stage] || C.dim;

  if (!rs.busy) {
    return (
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "1px 3px",
          borderBottom: `1px solid ${C.grid}`,
          color: C.dim,
          fontStyle: "italic",
          opacity: 0.55,
        }}
      >
        <span style={{ width: 38 }}>{rs.id}</span>
        <span style={{ flex: 1 }}>—</span>
      </div>
    );
  }

  let body: React.ReactNode;
  if (cls === "LOAD") {
    body = (
      <>
        <span>{rs.Qj ? <Q t={rs.Qj} /> : <V v={rs.Vj} />}</span>
        <span style={{ color: C.dim }}>+{rs.offset}</span>
        {rs.A !== null && <span style={{ color: C.magenta }}>@{rs.A}</span>}
      </>
    );
  } else if (cls === "STORE") {
    body = (
      <>
        <span>{rs.Qj ? <Q t={rs.Qj} /> : <V v={rs.Vj} />}</span>
        <span style={{ color: C.dim }}>+{rs.offset}</span>
        <span style={{ color: C.dim }}>←</span>
        <span>{rs.Qk ? <Q t={rs.Qk} /> : <V v={rs.Vk} />}</span>
      </>
    );
  } else if (cls === "BEQ") {
    body = (
      <>
        <span>{rs.Qj ? <Q t={rs.Qj} /> : <V v={rs.Vj} />}</span>
        <span style={{ color: C.dim }}>=</span>
        <span>{rs.Qk ? <Q t={rs.Qk} /> : <V v={rs.Vk} />}</span>
        <span style={{ color: C.dim }}>
          ?{(rs.offset ?? 0) >= 0 ? "+" : ""}
          {rs.offset}
        </span>
      </>
    );
  } else if (cls === "CALLRET") {
    body = <span>{rs.Qj ? <Q t={rs.Qj} /> : <V v={rs.Vj} />}</span>;
  } else {
    body = (
      <>
        <span>{rs.Qj ? <Q t={rs.Qj} /> : <V v={rs.Vj} />}</span>
        <span style={{ color: C.dim }}>·</span>
        <span>{rs.Qk ? <Q t={rs.Qk} /> : <V v={rs.Vk} />}</span>
      </>
    );
  }

  let progress: React.ReactNode = null;
  if (rs.stage === "EXECUTING" || rs.stage === "WRITING") {
    const total =
      rs.stage === "EXECUTING"
        ? rs.op === "LOAD" && rs.A !== null
          ? MEM_PHASE_CYCLES
          : DEFAULT_CONFIG.execLatency[rs.op as Opcode]
        : rs.op === "STORE"
          ? MEM_PHASE_CYCLES
          : 1;
    const done =
      total - (rs.stage === "EXECUTING" ? rs.remainingExec : rs.remainingWrite);
    const pct = Math.max(0, Math.min(1, done / total));
    progress = (
      <div
        style={{
          height: 2,
          background: C.grid,
          marginTop: 1,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct * 100}%`,
            background: color,
            transition: "width 0.2s",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={flash ? "ft-flash" : ""}
      style={{
        padding: "1px 3px",
        borderBottom: `1px solid ${C.grid}`,
        borderLeft: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 5,
          alignItems: "flex-start",
          fontSize: 8.5,
        }}
      >
        <span style={{ width: 34, color, fontWeight: 500, flexShrink: 0 }}>
          {rs.id}
        </span>
        <span style={{ color: C.amber, minWidth: 30, flexShrink: 0 }}>
          {rs.op}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            gap: 4,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          {body}
        </span>
        {rs.destReg != null && (
          <span style={{ color: C.dim, flexShrink: 0 }}>→R{rs.destReg}</span>
        )}
        <span
          style={{
            color,
            fontSize: 7.5,
            letterSpacing: 0.5,
            minWidth: 30,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {rs.stage === "EXECUTING"
            ? `EX:${rs.remainingExec}`
            : rs.stage === "WRITING"
              ? rs.remainingWrite > 0
                ? `WR:${rs.remainingWrite}`
                : "WR"
              : rs.stage === "EXEC_DONE"
                ? awaitingMem
                  ? "MEM?"
                  : "CDB?"
                : rs.stage}
        </span>
      </div>
      {progress}
    </div>
  );
}

const Q = ({ t }: { t: string }) => (
  <span style={{ color: C.yellow }}>«{t}»</span>
);
const V = ({ v }: { v: number | null }) => (
  <span style={{ color: C.text }}>{v ?? "?"}</span>
);

function FuBlock({
  title,
  box,
  active,
}: {
  title: string;
  box: { x: number; y: number; w: number; h: number };
  active: boolean;
}) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill={active ? `${C.yellow}22` : C.panel}
        stroke={active ? C.yellow : C.line}
        style={{ transition: "all 0.25s" }}
      />
      <text
        x={box.x + box.w / 2}
        y={box.y + box.h / 2 + 3}
        fill={active ? C.yellow : C.dim}
        fontSize="9"
        fontFamily="inherit"
        textAnchor="middle"
        letterSpacing="1.5"
      >
        {title.toUpperCase()}
      </text>
      {active && (
        <circle cx={box.x + box.w - 7} cy={box.y + 7} r={2.5} fill={C.yellow}>
          <animate
            attributeName="opacity"
            values="1;0.2;1"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </g>
  );
}

function RightColumn({
  state,
  prevState,
}: {
  state: SimState | null;
  prevState: SimState | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Panel
        title="Memory"
        subtitle={state ? `${Object.keys(state.memory).length} cells` : ""}
      >
        <MemoryView state={state} prevState={prevState} />
      </Panel>
      <Panel title="Metrics">
        <Metrics state={state} />
      </Panel>
    </div>
  );
}

function MemoryView({
  state,
  prevState,
}: {
  state: SimState | null;
  prevState: SimState | null;
}) {
  if (!state) return <div style={{ padding: 10, color: C.dim }}>—</div>;
  const entries = Object.entries(state.memory)
    .map(([a, v]) => [+a, v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 0)
    return (
      <div style={{ padding: 10, color: C.dim, fontStyle: "italic" }}>
        (empty)
      </div>
    );
  return (
    <div style={{ maxHeight: 140, overflowY: "auto", padding: "4px 8px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "1px 10px",
          fontSize: 9.5,
        }}
      >
        {entries.map(([a, v]) => {
          const changed = prevState && prevState.memory[a] !== v;
          return (
            <div
              key={a}
              className={changed ? "ft-flash" : ""}
              style={{
                display: "flex",
                gap: 6,
                padding: "1px 2px",
                borderBottom: `1px solid ${C.grid}`,
              }}
            >
              <span style={{ color: C.dim, width: 34 }}>[{a}]</span>
              <span
                style={{
                  flex: 1,
                  textAlign: "right",
                  color: changed ? C.green : C.text,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metrics({ state }: { state: SimState | null }) {
  if (!state) return <div style={{ padding: 10, color: C.dim }}>—</div>;
  const m = state.metrics;
  const ipc =
    m.cyclesElapsed > 0 ? m.instructionsCompleted / m.cyclesElapsed : 0;
  const mp =
    m.branchesEncountered > 0
      ? (m.branchesMispredicted / m.branchesEncountered) * 100
      : 0;
  const items: [string, string | number][] = [
    ["cycles", m.cyclesElapsed],
    ["completed", m.instructionsCompleted],
    ["ipc", ipc.toFixed(3)],
    ["branches", m.branchesEncountered],
    ["mispredicted", m.branchesMispredicted],
    ["miss %", `${mp.toFixed(1)}%`],
  ];
  return (
    <div
      style={{
        padding: "6px 10px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "4px 14px",
        fontSize: 10,
      }}
    >
      {items.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderBottom: `1px solid ${C.grid}`,
            padding: "2px 0",
          }}
        >
          <span
            style={{
              color: C.dim,
              textTransform: "uppercase",
              fontSize: 8.5,
              letterSpacing: 0.8,
            }}
          >
            {k}
          </span>
          <span style={{ color: C.amber, fontVariantNumeric: "tabular-nums" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

function TracePanel({ state }: { state: SimState | null }) {
  if (!state) return null;
  const rows = state.outputTrace;
  return (
    <div className="ft-panel" style={{ position: "relative", marginTop: 10 }}>
      <div className="ft-corner-tl" />
      <div className="ft-corner-tr" />
      <div className="ft-corner-bl" />
      <div className="ft-corner-br" />
      <div className="ft-panel-title">
        <span>Pipeline Trace</span>
        <span
          style={{
            color: C.dim,
            fontSize: 9,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          ISSUE → EXECUTE [start..end] → WRITE
        </span>
      </div>
      <div style={{ maxHeight: 170, overflowY: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}
        >
          <thead style={{ background: C.bg, position: "sticky", top: 0 }}>
            <tr
              style={{
                color: C.dim,
                fontSize: 8.5,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              <Th>#</Th>
              <Th>pc</Th>
              <Th>instr</Th>
              <Th>op</Th>
              <Th>issue</Th>
              <Th>exec.start</Th>
              <Th>exec.end</Th>
              <Th>write</Th>
              <Th>status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const statusColor =
                r.status === "DONE"
                  ? C.green
                  : r.status === "FLUSHED"
                    ? C.magenta
                    : C.amber;
              return (
                <tr key={r.seqId} style={{ borderTop: `1px solid ${C.grid}` }}>
                  <Td color={C.dim}>{r.seqId}</Td>
                  <Td color={C.dim}>{r.pc}</Td>
                  <Td>{r.text}</Td>
                  <Td color={C.amber}>{r.opcode}</Td>
                  <Td>{r.issueCycle ?? "—"}</Td>
                  <Td>{r.execStartCycle ?? "—"}</Td>
                  <Td>{r.execEndCycle ?? "—"}</Td>
                  <Td>{r.writeCycle ?? "—"}</Td>
                  <Td color={statusColor}>{r.status}</Td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <Td color={C.dim}>—</Td>
                <Td colSpan={8} color={C.dim}>
                  (no instructions issued yet)
                </Td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th style={{ textAlign: "left", padding: "5px 8px", fontWeight: 500 }}>
    {children}
  </th>
);
const Td = ({
  children,
  color,
  colSpan,
}: {
  children: React.ReactNode;
  color?: string;
  colSpan?: number;
}) => (
  <td
    colSpan={colSpan}
    style={{
      padding: "3px 8px",
      color: color || C.text,
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {children}
  </td>
);
