# FB-088 — The dynamic spatial hash rebuilds only when a body actually moved cells

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: physics.js, seam: spatialHash.js
**Write-set:** `src/core/physics.js`, `src/core/spatialHash.js`, `test/fb-spatial-hash-gate.test.mjs`
**Neighbours (extend, never restate):** NXB-057, SFQ-B213

## The gap
`shouldMaintainDynamicSpatialHash(_state)` in `src/core/physics.js` returns a bare true. The dynamic hash is
rebuilt every tick in every sector, including an idle Helios approach with two drifting rocks. The parameter
is named `_state` because nothing reads it: this is the largest unguarded per-tick cost on the table clock.

## Why this direction
A sim worker or a slower tick rate was rejected (TABLE_AUTHORITY_PLAN says do not spawn a worker; determinism
must not change). Surface-before-invent: `spatialHashLayersFromState` already partitions statics from dynamics
and carries `physicsStaticVersion`; the gate only needs to read what exists.

## Mechanism
- Track a per-tick dirty flag in the physics authority: set when a dynamic body's cell index changes, when a
  body spawns or despawns, or when `physicsStaticVersion` advances. Cell index is integer math on position, so
  the flag is deterministic.
- Make `shouldMaintainDynamicSpatialHash` return that flag (or true when a query arrives after a dirty tick that
  has not rebuilt yet). Never return stale neighbours: any position write before a query forces the rebuild.
- Expose a rebuild counter through the existing perf counters (`src/core/perfCounters.js` pattern) so the number
  is readable in the runtime witness.

## Done when
Seed 4242, Helios idle for 600 ticks: rebuild count ≤ 5% of ticks, and a 300-tick combat scene returns
byte-identical neighbour sets gated vs. ungated (the focused test compares them every tick). Goldens under
`test/*.expected.json` unchanged.

## Do not
Do not change the cell size or the Rapier collision world. Do not skip a rebuild when any body moved a cell.
Do not add a distance heuristic keyed on the player: a fight 5000 WU away still needs correct neighbours.

## Focus test starting points
- `test/physics-authority-cache.test.mjs`
- `test/lifetime-sweep-quiet-clocks-skip.test.mjs`
- Locate the spatial hash suites with `rg spatialHash test/` and name what you verified.
