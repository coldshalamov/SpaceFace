# PERF-08 — One draw per enemy kind, not per ship

**Lane 2. HOLD until PERF-04 lands** (it is editing `src/render/renderer.js`). PERF-03's census (receipt
`.devshots/fleet/runs/PERF-03.devin1.2026-11-12T04-26-14/RECEIPT.md`, Swarm round 20, seed 4242): hostile `fighter` hulls
**116–174 draw calls/frame**, `gunship` ~29, asteroids 38.5 for 14 objects (22 unique materials), the player 38 — of 346–516
total. The rigid-opaque batch (`src/render/rigidOpaqueBatch.js`, `rigidOpaqueBatchPolicy.js`) already merges what it may
*within* one hull; nothing shares draws *across* hulls of the same kind.

## Job
Draw same-model hostile hulls as GPU instances (one `InstancedMesh` per leaf × material per hull model), with per-instance
attributes for what differs per ship today (transform, team/damage tint, hit flash, visibility/LOD). The picture must be
identical — screenshot pairs at the same tick, round 20 and round 5, side by side in the receipt. Leaves the batch policy
excludes for visual reasons (canopies, plumes, decals, nav lights, damage states) stay as they are unless you can instance
them with the same look. Measure fps / idle / sim-wall / draw calls before and after, back to back, same seed.
Also: the 14 asteroids use 22 materials — share materials where the authored look is the same.

Files: `src/render/rigidOpaqueBatch.js`, `rigidOpaqueBatchPolicy.js`, `renderer.js` (entity view sync), a new
`src/render/hullInstancing.js`, tests. Commits: `perf(PERF-08): <what> (<fps/draws before → after>)`.
