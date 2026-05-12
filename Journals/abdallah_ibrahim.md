# Journal: Abdallah Ibrahim (900232544)

- Designed and implemented interface between the UI and the core simulator engine linking `SimState` with `CoreState` and snapshot based system to rewind and step through.
- Wrote the CDB logic, the WAW resolution with register-status tag check, and the in-order memory queue that enforces load-store hazards (debugged the BEQ flush path together with John)
- Vibe-coded the entire React UI in one shot, then spent a while fine-tuning it afterwards because the first pass wasn't perfect (fixed the layout, the trace table styling, the cycle scrubber behavior, and the highlight-flash)
