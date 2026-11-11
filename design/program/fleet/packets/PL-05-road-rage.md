# PL-05 — Road rage: shove the same civilian twice and it shoves back once, then runs

**Source:** row PL-05 of `design/program/INFERENCE_PLANTS.md`. **Size:** small. **Tier:** any worker.

## What the player must see (exact)
If the player **shoves** (the Shove power, a repulsor field, or a ram that moves it) the **same
civilian ship** twice within **30 seconds of sim time**, that civilian:
1. turns toward the player and accelerates at it for up to 3 seconds — one clumsy ram attempt
   (it is a civilian: it does not fire weapons);
2. whether or not it connects, it then flees directly away from the player at its top speed for
   15 seconds, then returns to whatever it was doing.
It never does this a second time to the same player within 5 minutes. No text and no voice.

"Civilian" means a non-hostile, non-police, non-player ship (find how the AI marks traffic/civilians:
`grep -rln "civilian" src/ai src/systems | head`).

## Read first
- `design/program/INFERENCE_PLANTS.md` — the "Rules for every plant" section.
- How a Shove reaches a ship: `src/systems/fields.js` (search `repulsor`) and any event emitted when a
  field pushes an entity; if there is no such event, detect it from the impulse membrane or contact
  events (search `impulse` / `contact` events in `src/systems`).
- How civilian AI chooses what to do: start at the files `grep -rln "civilian" src/ai` lists. Use the
  existing behaviour mechanism (a temporary goal, mood or override); do not write a new AI system.
- Use `state.simTime` for all timing and `state.rng` for any randomness. No `Date.now`, no `Math.random`.

## Files you may edit
- the one AI file that owns civilian behaviour (name it in your receipt)
- at most one system file to count shoves per civilian (or a new `src/systems/roadRage.js` registered
  where similar small systems are registered)
- one new test `test/road-rage.test.mjs`
- `design/program/INFERENCE_PLANTS.md`: PL-05's State cell → `SHIPPED <your commit hash>` (separate commit)
Run `git diff -- <file>` before editing each existing file; foreign changes → stop, report Blocked.

## Checks
1. `node --test test/road-rage.test.mjs`: one shove → nothing; two shoves 10 s apart → ram then flee;
   two shoves 40 s apart → nothing; a third pair within 5 minutes → nothing.
2. `node scripts/inference-record.mjs --kind plant --id PL-05 --player "<one sentence>" --evidence "<test name and result>"`
   (run with `--help` first to confirm the flags).

## Done when
Checks pass and both commits exist. Commit message: `plant: a twice-shoved civilian shoves back, then runs (PL-05)`.
