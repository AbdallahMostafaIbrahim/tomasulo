export interface SampleProgram {
  name: string;
  source: string;
  dataInit: Record<number, number>;
  startPC: number;
}

export const SAMPLE_PROGRAMS: SampleProgram[] = [
  {
    name: "General",
    source: `LOAD R1, 0(R0)
LOAD R2, 1(R0)
ADD  R3, R1, R2
MUL  R4, R1, R2
SUB  R5, R4, R3
AND  R6, R1, R2
STORE R3, 2(R0)
STORE R4, 3(R0)`,
    dataInit: { 0: 6, 1: 7 },
    startPC: 0,
  },
  {
    name: "Countdown loop",
    source: `LOAD R4, 0(R0)
LOAD R2, 1(R0)
ADD  R3, R0, R0
BEQ  R4, R0, 3
ADD  R3, R3, R2
SUB  R4, R4, R2
CALL -3
STORE R3, 3(R0)`,
    dataInit: { 0: 5, 1: 1 },
    startPC: 0,
  },
  {
    name: "Loads and Stores",
    source: `LOAD  R4, 0(R0)
LOAD  R5, 1(R0)
MUL   R3, R4, R5
STORE R3, 2(R0)
LOAD  R6, 3(R0)
ADD   R7, R6, R0`,
    dataInit: { 0: 3, 1: 4, 3: 99 },
    startPC: 0,
  },
  {
    name: "Call/return",
    source: `BEQ  R0, R0, 2
ADD  R2, R2, R2
RET
LOAD R2, 0(R0)
CALL -3
ADD  R3, R2, R0
STORE R3, 4(R0)`,
    dataInit: { 0: 5 },
    startPC: 0,
  },
];
