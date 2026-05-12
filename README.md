# Tomasulo Algorithm Simulator

Tomasulo Algorithm Simulation (non-speculative, single-issue, 16-bit RiSC-16-style ISA).

- Hosted on [tomasulo.abdallahmostafa.com](https://tomasulo.abdallahmostafa.com)
- Github: [https://github.com/AbdallahMostafaIbrahim/tomasulo](https://github.com/AbdallahMostafaIbrahim/tomasulo)

---

## Team

| Name              | ID        |
| ----------------- | --------- |
| Abdallah Ibrahim  | 900232544 |
| John Saif         | 900232149 |

---

## What this submission contains

```
.
├── README.md          ← this file
├── REPORT.md          ← the report (implementation, AI usage, user guide, results)
├── Journals/          ← per-member activity logs
│   ├── abdallah_ibrahim.md
│   └── john_hany.md
├── Test/              ← assembly test programs (with data) used to verify the simulator
│   ├── general.asm
│   ├── countdown_loop.asm
│   ├── loads_and_stores.asm
│   └── call_return.asm
└── src/               ← simulator source code (TypeScript + React UI)
```

---

## How to run

The simulator is a web application written in TypeScript with a React UI on top of a pure-functional simulator core.

### Prerequisites

- Node.js ≥ 18
- `pnpm` (or `npm` / `yarn`; `pnpm` is what we used)

### Install and run

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

---

## Supported ISA

8 general-purpose registers `R0..R7`, with `R0` hardwired to 0. Memory is word-addressable, 16-bit addresses.

| Instruction | Form                  | Notes                                          |
| ----------- | --------------------- | ---------------------------------------------- |
| `LOAD`      | `LOAD rA, off(rB)`    | offset is a 5-bit signed immediate (−16..15)   |
| `STORE`     | `STORE rA, off(rB)`   | offset same as `LOAD`                          |
| `BEQ`       | `BEQ rA, rB, off`     | branches to `PC+1+off` if `rA == rB`           |
| `CALL`      | `CALL off`            | 7-bit signed offset; stores `PC+1` into `R1`   |
| `RET`       | `RET`                 | jumps to address in `R1`                       |
| `ADD`       | `ADD rA, rB, rC`      | `rA = rB + rC`                                 |
| `SUB`       | `SUB rA, rB, rC`      | `rA = rB - rC`                                 |
| `AND`       | `AND rA, rB, rC`      | bitwise AND                                    |
| `MUL`       | `MUL rA, rB, rC`      | low 16 bits of `rB * rC`                       |

Comments use `;` and run to end of line. Instructions are case-insensitive. Integer offsets only (no symbolic labels).

---

## Functional units / latencies

Matches the spec table exactly:

| Unit          | # RS | Cycles                          |
| ------------- | ---- | ------------------------------- |
| LOAD          | 2    | 2 (addr) + 6 (memory read)      |
| STORE         | 2    | 2 (addr) + 6 (memory write)     |
| BEQ           | 2    | 1 (compare + target)            |
| CALL/RET      | 1    | 1                               |
| ADD/SUB       | 4    | 2                               |
| AND           | 2    | 1                               |
| MUL           | 1    | 8                               |

---

## What works

- All 9 instructions correctly issue, execute, and write back.
- Reservation-station and register-status (Qi) tracking.
- CDB queue: when multiple RSes finish in the same cycle, the **oldest in program order** broadcasts first; the others wait one more cycle.
- WAW and WAR correctly resolved through register renaming via RS tags.
- Load/store hazards: a LOAD waits for any earlier pending STORE to commit before it reads memory (in-order memory queue).
- Branch handling: `BEQ` is issued with an **always-not-taken** prediction; if it resolves taken, **all RSes younger than the branch are flushed**, PC is redirected, mispredictions are counted.
- `CALL` redirects PC at issue and broadcasts `PC+1` on the CDB for `R1`.
- `RET` stalls front-end issue until `R1` is known, then redirects PC.
- Final metrics: total cycles, IPC, branch misprediction percentage, instructions completed.
- Per-instruction trace table (Issue / Exec start / Exec end / Write cycles).

### Bonus features included

1. **GUI application**: full React + TypeScript web UI.
2. **Educational GUI**: cycle-by-cycle stepping (forward *and* backward) with live views of all reservation stations, the register file, register status, memory, the instruction queue, the CDB-pending list, the in-order memory queue, and a per-cycle textual narration log. (This counts as two bonuses per the spec.)

---

## What does not work / known limitations

- No symbolic labels in the assembler (only integer offsets). Loops are written using numeric jump distances.
- Multiple-issue not supported (strictly single-issue).
- The simulator assumes the instruction queue is pre-filled; there is no fetch/decode stage.
