# INV-04 — Does the first hour's tuning match the design? (READ-ONLY audit, no game)

**You change no tracked file and start no game or browser.** Output: your RECEIPT.md.

The design authority is `design/game/` (start with its README; the first hour is doc 20, the ten-minute card
is in doc 18, decisions D1–D10 in doc 10). The code sometimes drifted from it: numbers tuned by different
agents at different times, old systems left switched on, features from older plans still live.

## Find mismatches in the first hour: Swarm rounds 1–5 and the Adventure opening (Helios / 47-A)
For each, quote the design line (doc file + heading) and the code line (`file:line`, quoted), and say which
way it differs. Look at:
1. Swarm rounds 1–5: what spawns, how many, how fast, which enemy types, what the round asks of the
   player (`src/data/swarm*.js`, `src/data/survival*.js`, `src/systems/*wave*`), versus the design's
   intended ramp and the first-ten-minutes card.
2. The verbs the design says the first hour teaches, in order (latch, swing, throw, powers 1–5 …), versus
   what the code actually unlocks or offers in rounds 1–5 and in the opening, and when.
3. Anything shown to the player in the first hour (tutorial lines, callouts, notices, HUD panels) that the
   design does not call for, or that the design forbids.
4. Numbers the design states explicitly (times, counts, damage rules, cooldowns) that the code sets differently.
5. Systems from older plans that are still live in the first hour but appear nowhere in `design/game/`.

## The receipt
Under **What the player now sees or feels**: a table of at most 25 mismatches, ranked by how much each
changes the player's first hour, with columns: what, design quote + location, code quote + location,
direction of drift. Only include items where you quote both sides. Then a short list of "the design says X
but I found no code for it at all".
