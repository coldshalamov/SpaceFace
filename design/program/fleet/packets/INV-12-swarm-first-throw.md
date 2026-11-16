# INV-12 — Can a new player throw in Swarm round 1? (READ-ONLY critic + measurement)

**You change no tracked file.** Files only under `.devshots/fleet/inv12/`. Output: RECEIPT.md.

## Why
The ACCEPT-01 headed run (`.devshots/fleet/accept01/swarm/`, receipt `.devshots/fleet/runs/ACCEPT-01-*/RECEIPT.md`) got
**zero throws in five attempts** in Swarm round 1 (`target_lost` / `subsystem_disabled` breaks) and died at 22.5 s.
Since then a "one weight rule" landed: anything heavier than the Line class's limit (class I = 20 t) now reads
TOO HEAVY before the latch. The design says Swarm rocks and Wasps are ammunition (`design/game/12_SWARM_THE_PIT.md`).

## Do this
1. Through the lock, twice (never kill a holder you did not start):
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/inv12/run1 --max-min=6`
   and the same with `run2`.
2. From `demo-route.json` / `report.md` and the frames, report per run: every latch attempt (target kind, mass if
   logged, result), every line end with its reason, `massline:throw` count, seconds from first flight to first
   throw, time and cause of death.
3. Count how often the aim tag says **TOO HEAVY** vs **RMB · LATCH** in the frames and the text log, and on what
   (Wasps? rocks? containers?). Is anything throwable left for a class-I pilot in round 1?
4. Look at the latch/swing/release frames as a player: is it clear what to grab, when to throw, and why a throw
   failed? Name what a first-time player would not understand.
## Receipt
Per-run table, the TOO HEAVY census, the death cause, and the top 5 reasons a new player fails to throw in round 1,
each with frame + evidence. No code proposals needed.
