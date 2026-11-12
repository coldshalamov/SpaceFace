# PLANT-RADIO — Build the next radio line from the plant list (repeatable)

**Lane 4.** Follow `design/program/fleet/packets/PLANT-NEXT.md` in full (claiming, rules, allowed files,
checks, commit), with one change to "Pick your row": take the **first `OPEN` row in section E** (radio lines)
of `design/program/INFERENCE_PLANTS.md`. Copy the pattern of PL-52: the exact line as written, one data row
in `src/data/flavor/040-band.js` (or the flavor file the row names), one event key the trigger emits, wired
through `src/systems/bandRadio.js`. A test proves the real trigger event (its real payload fields — PROTOCOL
rule 8) produces the line once, and not again inside its cooldown.
