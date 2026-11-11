# PL-08 — Applause: a station flashes its dock lamps at a slingshot kill

**Source:** row PL-08 of `design/program/INFERENCE_PLANTS.md`. **Size:** small. **Tier:** any worker.

## What the player must see (exact)
When the player kills a ship **with a thrown body** (a slingshot/Line release — the kill is credited
to a body the player threw, not to a gun) and a station is within **1500 world units** of the kill,
that station's **dock lamps flash twice** (on 0.15 s, off 0.15 s, on 0.15 s, off) within half a
second of the kill. No text, no voice, no sound. At most once per station per 20 seconds of sim time.

## Read first
- `design/program/INFERENCE_PLANTS.md` — the "Rules for every plant" section.
- Find the kill event and how a throw kill is told apart from a gun kill:
  `grep -rn "entity:killed" src/systems/*.js | head`, then look at the payload fields
  (search for `cause`, `source`, `thrown`, `impulse`, `slingshot`, `tether` near the emit).
- Find station dock lamps in the renderer: `grep -rln "dockLamp\|dock_lamp\|berthLamp\|approachLight" src/render`.
  If stations have no lamp objects you can drive, flash the station's existing emissive/beacon
  light instead and say so in the receipt.
- The sim must not import Three.js. Put the decision ("this station should flash now") in the sim
  or a system and send it to the renderer as an event or a presentation field, the way other
  presentation cues travel (search `src/render` for `bus.on(` to see examples).

## Files you may edit
- at most one system file where the kill is heard (or a new `src/systems/stationApplause.js`, wired
  where similar small systems are registered — name the file in your receipt)
- at most one render file that drives the lamps
- one new test `test/station-applause.test.mjs`
- `design/program/INFERENCE_PLANTS.md`: change PL-08's State cell to `SHIPPED <your commit hash>` (a
  second, separate commit after the code commit)
Run `git diff -- <file>` before editing each existing file; foreign changes → stop, report Blocked.

## Checks
1. `node --test test/station-applause.test.mjs`: a throw kill 1000 WU from a station → one flash cue
   for that station; a gun kill → none; a throw kill 2000 WU away → none; two throw kills 5 s apart
   → one cue.
2. Record it: `node scripts/inference-record.mjs --kind plant --id PL-08 --player "<one sentence>" --evidence "<test name and result>"`
   (run `node scripts/inference-record.mjs --help` first to confirm the flags).

## Done when
Checks pass and both commits exist. Commit message: `plant: a station flashes its lamps at a slingshot kill (PL-08)`.
