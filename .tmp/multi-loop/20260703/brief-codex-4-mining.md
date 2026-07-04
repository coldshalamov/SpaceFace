# TASK: Mining 2.0 minigame core (SpaceFace WS-C1) — WAVE 2

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §5 (the design you are implementing,
items 1–3 + 6 only) and `design/BUILD_PLAN_2_0.md` §0 (input contract). Study `src/systems/mining.js`
(you will refactor its interaction loop — keep beam tiers, ore tables, pickups), `src/systems/scanner.js`
(scan highlights you must respect), `src/data/mining.js`, and how asteroids spawn in `src/systems/world.js`.

## Build exactly this
1. **Seams**: at asteroid spawn, derive 1–4 seam points deterministically from `hash32(state.meta.seed, asteroidId)`
   — store as angles+local offsets in `asteroid.data.seams`. Beam damage within 14 wu of a seam point
   (world-space, accounting for asteroid rotation) yields 100%; elsewhere 35% (`SEAM_YIELD_OFF = 0.35`).
   Emit `mining:seamHit {asteroidId}` at most 2/s while on-seam (VFX hooks later; do not touch render).
2. **Vent rhythm**: releasing the beam while heat is in [70, 95] grants `mining.ventBonusUntil = simTime + 2`
   → +25% extraction rate while active. Overheat lock unchanged. Emit `mining:ventBonus {}` on trigger.
3. **Fracture**: at 0 hull, split the asteroid into 2–3 chunk entities (radius 35–50% of parent, hull
   proportional, inherit seams count-1) plus the ore burst. Chunks are minable asteroids with
   `data.isChunk = true`. Deterministic split (state.rng). Cap: chunks never split again.
4. **Vacuum buff**: magnet range 250→420, accel 280→520 (constants at the top of mining.js), and any
   pickup within 60 wu of the active beam line collects direct-to-cargo (the `directToCargo` path exists).
5. **Attention meter**: mining accrues `state.player.miningNoise` (+8/s beaming, decay 3/s idle, clamp 0–100).
   At >70, emit `danger:miningNoise {level}` once per crossing — `src/systems/dangerModel.js` consumes it
   later (do NOT edit dangerModel; just emit).
6. Update `scripts/check-gameplay-core.mjs` expectations ONLY if it asserts mining specifics that changed;
   otherwise add `scripts/check-mining-2.mjs` (sim-harness scenario): beam a seeded asteroid, assert
   seam-hit yield > off-seam yield, vent bonus fires, fracture produces chunks, pickups reach cargo without
   player movement. 

## Constraints
- Files you may edit: `src/systems/mining.js`, `src/data/mining.js`, `src/systems/world.js` (asteroid
  spawn block only), new check script, package.json (one script line).
- Do NOT touch: render/UI/audio, `src/systems/input.js`, tetherGameplay, scanner internals, goldens.
- Determinism: state.rng / hash32 only. `npm run check:sim` hash parity note: if the 47a golden hash
  drifts BUT `check:sim:compare` shows hashEqual:true/firstDivergentTick:null between uninterrupted and
  reload runs, report it — the lead regenerates goldens; do not edit them yourself.

## Verify
```
node scripts/check-mining-2.mjs && npm run check:sim:compare ; npm run check:balance
```
Write the files. 10-line summary max.
