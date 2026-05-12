; Test program 4: CALL / RET 
; Initial memory:
;   M[0] = 5

BEQ   R0, R0, 2
ADD   R2, R2, R2
RET
LOAD  R2, 0(R0)
CALL  -3
ADD   R3, R2, R0
STORE R3, 4(R0)
