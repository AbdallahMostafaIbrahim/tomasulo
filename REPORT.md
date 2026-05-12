# Tomasulo Algorithm Simulator

---

## 1. Implementation Overview

This is a cycle-accurate simulator for a single-issue, 16-bit RiSC processor that executes instructions out-of-order using the **non-speculative** Tomasulo algorithm. The full simulator is written in **TypeScript** and runs entirely in the browser as a **React + Vite** single-page application (no server, no installation; just open the page and the simulator runs locally).

The codebase is split deliberately into two halves:

- **A pure, framework-free simulator core** (`src/simulator/`) that takes an instruction list and produces a stream of fixed cycle snapshots. It has no awareness of the UI.
- **A React UI** (`src/App.tsx`, `src/components/`) that consumes those snapshots and renders the Tomasulo datapath as a live schematic.

### 1.1 The Core Engine

The core is organised around a single function: `step(state)`, which advances exactly one clock cycle. Each cycle performs five steps, in this order:

| Phase | What happens |
|------:|--------------|
| 1. **Write** | Tick down `remainingWrite` for any RS in `WRITING`.Then the **CDB queue** picks the lowest-`seqId` instruction from `cdbWaitQueue` and broadcasts its value to the register file and every other RS. |
| 2. **Execute** | Tick `remainingExec` for every `EXECUTING` RS. When it hits zero, dispatch to the appropriate completion handler: LOAD has a two-phase finish (address-compute → memory read), STORE only finishes its address phase here, BEQ/RET enter a 1-cycle write, ALU ops queue for the CDB. |
| 3. **Memory Port** | Instructions use single ported memory, in program order, to the oldest address-ready load store queue entry that has no earlier conflicting access (see section 2 below). |
| 4. **Issue** | One instruction per cycle (single-issue). The instruction at the current PC is matched to a free RS of the correct functional-unit class; if no RS is free or a CALL/RET is currently active, issue stalls. |
| 5. **Wake-Up** | Any RS still in `ISSUED` whose operands have just arrived (`Qj`/`Qk` resolved) transitions to `EXECUTING`, starting next cycle. |



### 1.2 Functional-Unit Latencies

Latency table is implemented in `DEFAULT_CONFIG` in `types.ts`:

| Unit | RS count | Execute cycles |
|------|:--------:|:--------------:|
| LOAD | 2 | 2 (address) + 6 (memory read) |
| STORE | 2 | 2 (address) + 6 (memory write) |
| BEQ | 2 | 1 |
| CALL/RET | 1 | 1 |
| ADD/SUB | 4 | 2 |
| AND | 2 | 1 |
| MUL | 1 | 8 |

### 1.3 The ISA, Parser, and Programs

The simulator supports the full nine-instruction RiSC-16 subset: `LOAD`, `STORE`, `BEQ`, `CALL`, `RET`, `ADD`, `SUB`, `AND`, `MUL`, with 8 general-purpose 16-bit registers (R0 hard-wired to zero) and 64K of word-addressable memory.

A parser (`src/simulator/tokenizer.ts`) is implemented that takes assembly input, and produces a list of `Instruction` objects ready for the core to execute. We have preset test programs that are in `Tests/` and also in the web UI.

### 1.4 Non-Speculative Branch Handling

The project description says:

> *"instructions can be issued (but not executed nor written) based on a prediction."*

We implement that rule by:

- **Issue past an unresolved `BEQ` is allowed.** On issue, a `BEQ` immediately advances the PC to `PC+1` (the not-taken prediction). More recent instructions continue to issue into reservation stations, capture their operand values or rename tags, and claim destination tags in the register-status table, exactly as they would on a non-branchy program. This is what keeps the predictor meaningful and the misprediction metric non-trivial.
- **Execute past an unresolved `BEQ` is blocked.** We block any transition from `ISSUED` to `EXECUTING` when its `seqId` is greater than the oldest pending branch.
- **On taken-branch resolution**, `flushAfter(branchSeqId)` (`flushAfter.ts`) tears down every RS with a strictly-greater `seqId`: register-status tags pointing at them are cleared, their entries are pulled out of the memory queue and CDB wait queue, and this happens when the branch is actually taken while mispredicting it earlier. 

### 1.5 Bonus Features Implemented

We implemented **two bonus features**:

1. **GUI application**: the entire simulator is a web app, with the Tomasulo datapath rendered live as a canvas.
2. **Cycle-by-cycle educational mode**: every snapshot in the run is preserved, and the toolbar lets the user **move through cycles**, step forward/backward one cycle at a time, or play through at adjustable speed (0.5×–8×). So the user can step through any program cycle by cycle.

---

## 2. Handling Load-Store Hazards

Load-Store hazards are handled like the lecture slides:

### 2.1 The In-Order Memory Queue (Load Store Queue)

We maintain `inOrderMemQueue`, a list of RS ids in **program order** for every `LOAD` and `STORE` that has been issued but not yet committed to memory. Entries are pushed at issue time (`issueInstruction.ts`) and removed only after the load's CDB broadcast or the store's memory write completes.

### 2.2 Address-Compute Ordering

A LOAD or STORE cannot begin its execute phase until **every earlier Load Store Queue entry has had its address computed** (`anyEarlierAddrPending` in `helpers.ts`). This gives us a guarantee that by the time we look for memory conflicts, every relevant address is known.

### 2.3 Single Ported Memory Conflict Checking

Our assumption is that the data memory **single ported**: only one LOAD or STORE may be in its 6-cycle memory phase at a time (`memoryPortBusy()`). Each cycle, if the port is free, we walk the Load Store Queue in program order and pick the oldest ready entry that passes its conflict checks:

- **For a LOAD**: it must not have a *store-to-load* conflict with any earlier entry, i.e. `anyEarlierStoreConflict(i, addr)`; no earlier `STORE` may target the same address. Earlier loads or unrelated stores don't block it.
- **For a STORE**: its value operand must be ready (`Qk === null`), and it must have *no* earlier conflict at all (`anyEarlierMemConflict(i, addr)`); both *store-load* and *store-store* hazards are prevented.

A result of this design (which is tested in the *"LOAD and STORE"* sample program) is that **a more recent load to a different address can slip past an older store that is stalled waiting for its value operand**, but only when the addresses can actually be proven non-conflicting. If the older store's address itself isn't known yet, the Load Store Queue ordering rule blocks the younger load conservatively.

---

## 3. Simulator Outputs

For every run the simulator displays:

- A **pipeline trace table** (`TracePanel` in `App.tsx`) listing, per instruction, the cycle of issue, execute-start, execute-end, and write. Status of each row is one of `ISSUED`, `EXECUTING`, `DONE`, `FLUSHED`.
- **Total execution time** in cycles.
- **IPC** = instructions-completed / total-cycles.
- **Branch misprediction percentage** = mispredicted / encountered × 100%.
- Counts of instructions completed, branches encountered, and branches mispredicted.
- Live views of memory cells, register file (with current rename tags), and a per-cycle log of every event (issue, exec-done, mem-read-start, CDB broadcast, flush, halt).

---

## 4. AI Usage

We used Claude primarily on the **UI layer**. The initial portion of the React interface (the reservation-station table, the register file / memory views, and the trace panel) was generated with Claude's help (vibe-coding): we gave him a screenshot of the tomasulo block diagram from the slides and described the components we wanted and iterated on the output. The result needed a lot of fine-tuning afterwards (layout, styling, the flash-on-change behavior)


The **simulator core** in `src/simulator/` (the cycle-stepper, the CDB queue, the Load Store queue logic, the flush path) was written by us. We occasionally used Chatgpt as a for design discussions (e.g. clarifying the textbook treatment of non-speculative issue past an unresolved branch).

The sample programs and this report were written by us.

---

## 5. User Guide

1. Open the app (`npm install && npm dev`, then navigate to the printed URL).
2. In the left column, either type assembly directly into the **Program Source** box or pick one of the five **Sample** programs from the dropdown and click **Load**.
3. Enter any initial memory contents in the **Memory Init** panel as `addr: value` lines.
4. Set the **start PC** if non-zero.
5. Click **▶ Build & Run** to assemble and simulate.
6. Use the toolbar to step (◀ Back / Step ▶), scrub the cycle slider, jump to the end (⏭ End), or hit **▶ Play** for cycle-by-cycle animated playback at the chosen speed.
7. Inspect the live schematic, register file, memory, metrics, and the pipeline trace at the bottom.

