; Test program 2: Countdown loop
; Initial memory:
;   M[0] = 5   ; loop counter
;   M[1] = 1   ; accumulator increment

LOAD  R4, 0(R0)        
LOAD  R2, 1(R0)        
ADD   R3, R0, R0       
BEQ   R4, R0, 3        
ADD   R3, R3, R2       
SUB   R4, R4, R2       
CALL  -3               
STORE R3, 3(R0)        
