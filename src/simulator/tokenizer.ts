// Pure parser. Input: assembly text. Output: Instruction[] or ParseError[].
//
// Grammar:
//   line         := [whitespace] [instruction] [comment]? [whitespace] EOL
//   comment      := ';' .*
//   instruction  := opcode operands?
//
//   LOAD/STORE   := OP rA "," offset "(" rB ")"      ; offset in [-16, 15]
//   BEQ          := BEQ rA "," rB "," offset         ; offset in [-64, 63]
//   CALL         := CALL offset                      ; offset in [-64, 63]
//   RET          := RET
//   ADD/SUB/AND/MUL := OP rA "," rB "," rC

import type { Instruction, Opcode, RegId } from "./types";

export interface ParseError {
  lineNumber: number;
  message: string;
  line: string;
}

export type ParseResult =
  | { ok: true; instructions: Instruction[] }
  | { ok: false; errors: ParseError[] };

const OPCODES = new Set<Opcode>([
  "LOAD",
  "STORE",
  "BEQ",
  "CALL",
  "RET",
  "ADD",
  "SUB",
  "AND",
  "MUL",
]);

function parseRegister(token: string): RegId | null {
  const m = /^[Rr]([0-7])$/.exec(token);
  if (!m) return null;
  return Number(m[1]) as RegId;
}

function parseInt16(token: string): number | null {
  // Decimal (signed) or 0x hex
  const t = token.trim();
  if (/^-?0[xX][0-9a-fA-F]+$/.test(t)) {
    const sign = t.startsWith("-") ? -1 : 1;
    const body = t.replace(/^-/, "");
    return sign * parseInt(body, 16);
  }
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

function inRange(v: number, lo: number, hi: number): boolean {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

// Strip a `;` comment, preserving the part before it.
function stripComment(line: string): string {
  const i = line.indexOf(";");
  return (i === -1 ? line : line.slice(0, i)).trim();
}

// Split `LOAD R1, 5(R2)` into ["LOAD", "R1", "5", "R2"].
function tokenizeLine(line: string): string[] {
  // Replace ',' '(' ')' with whitespace, then split.
  return line
    .replace(/[(),]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

export function parseProgram(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const instructions: Instruction[] = [];
  const errors: ParseError[] = [];
  let pc = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const lineNumber = i + 1;
    const stripped = stripComment(rawLine);
    if (stripped === "") continue;

    const tokens = tokenizeLine(stripped);
    if (tokens.length === 0) continue;

    const opUpper = tokens[0].toUpperCase() as Opcode;
    if (!OPCODES.has(opUpper)) {
      errors.push({
        lineNumber,
        line: rawLine,
        message: `Unknown opcode "${tokens[0]}"`,
      });
      continue;
    }

    try {
      const instr = parseInstruction(opUpper, tokens, pc, lineNumber, rawLine.trim());
      instructions.push(instr);
      pc++;
    } catch (e) {
      errors.push({
        lineNumber,
        line: rawLine,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, instructions };
}

function parseInstruction(
  op: Opcode,
  tokens: string[],
  pc: number,
  lineNumber: number,
  text: string,
): Instruction {
  const need = (n: number) => {
    if (tokens.length !== n + 1) {
      throw new Error(`${op} expects ${n} operand(s), got ${tokens.length - 1}`);
    }
  };
  const reg = (s: string): RegId => {
    const r = parseRegister(s);
    if (r === null) throw new Error(`Invalid register "${s}"`);
    return r;
  };
  const intIn = (s: string, lo: number, hi: number, what: string): number => {
    const v = parseInt16(s);
    if (v === null) throw new Error(`Invalid integer "${s}" for ${what}`);
    if (!inRange(v, lo, hi)) {
      throw new Error(`${what} ${v} out of range [${lo}, ${hi}]`);
    }
    return v;
  };

  switch (op) {
    case "LOAD":
    case "STORE": {
      // OP rA, offset(rB) -> tokens: [OP, rA, offset, rB]
      need(3);
      const rA = reg(tokens[1]);
      const offset = intIn(tokens[2], -16, 15, "offset");
      const rB = reg(tokens[3]);
      return { pc, lineNumber, opcode: op, rA, rB, offset, text };
    }
    case "BEQ": {
      // BEQ rA, rB, offset
      need(3);
      const rA = reg(tokens[1]);
      const rB = reg(tokens[2]);
      const offset = intIn(tokens[3], -64, 63, "offset");
      return { pc, lineNumber, opcode: op, rA, rB, offset, text };
    }
    case "CALL": {
      // CALL offset
      need(1);
      const callOffset = intIn(tokens[1], -64, 63, "label");
      return { pc, lineNumber, opcode: op, callOffset, text };
    }
    case "RET": {
      need(0);
      return { pc, lineNumber, opcode: op, text };
    }
    case "ADD":
    case "SUB":
    case "AND":
    case "MUL": {
      // OP rA, rB, rC
      need(3);
      const rA = reg(tokens[1]);
      const rB = reg(tokens[2]);
      const rC = reg(tokens[3]);
      return { pc, lineNumber, opcode: op, rA, rB, rC, text };
    }
  }
}
