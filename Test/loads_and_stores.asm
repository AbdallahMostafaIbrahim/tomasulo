; Test program 3: Loads and Stores 
; Initial memory:
;   M[0] = 3
;   M[1] = 4
;   M[3] = 99

LOAD  R4, 0(R0)
LOAD  R5, 1(R0)
MUL   R3, R4, R5
STORE R3, 2(R0)
LOAD  R6, 3(R0)
ADD   R7, R6, R0
