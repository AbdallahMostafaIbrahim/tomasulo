; Test program 1: General tests LOAD, ADD, MUL, SUB, AND, STORE
; Initial memory:
;   M[0] = 6
;   M[1] = 7

LOAD  R1, 0(R0)
LOAD  R2, 1(R0)
ADD   R3, R1, R2
MUL   R4, R1, R2
SUB   R5, R4, R3
AND   R6, R1, R2
STORE R3, 2(R0)
STORE R4, 3(R0)
