# Wave-4 Lane Report — BVH for Raycasts / Spatial Queries

Lane question: *do hot paths in `src/render` / `src/systems` run naive O(n) triangle walks or
per-frame `THREE.Raycaster` mesh queries that `three-mesh-bvh` (or a lighter in-repo BVH)
should accelerate?*

Branch: `devin/1790666435-w4-bvh` off `origin/master` (7f04503e1).

## Verdict: DOCUMENTED — no change

Mesh raycasts do not exist in `src/` anymore. Every `THREE.Raycaster` remaining is a
constant-time ray→plane helper; every entity-level spatial query already sits on the in-repo
`SpatialHash` broad-phase (with static/dynamic layers, incremental rehash, query caches, and
coherent/batch APIs); and the two places that once walked triangles — wide camera clearance
and retro-mount skin seating — are already BVH/analytic as of prior waves. Measured inside
the golden 47-A run, the **entire spatial-query subsystem is ≈1.8–2.7 % of sim wall/CPU**.
Adding `acceleratedRaycast` or another BVH now would spend build time and code risk to
accelerate a path that does not execute.

## Counts

### Mesh raycasts (the BVH target class)

| Site | Form | Frequency |
|---|---|---|
| `src/render/renderer.js:4659,15822` (`raycastToPlane`) | `setFromCamera` + `ray.intersectPlane` — O(1) analytic | ≤1 per input poll (mouse-aim branch, `src/systems/input.js:1262`); per-gesture in `drawFlightInput.js:34`, `dynamicFlightStick.js:125` |
| `src/render/spaceBackground.js:1073` (`castToPlane`) | same ray→plane | camera/scale measurements only |
| `src/ui/asteroid/asteroidRenderer3d.js:6498` (`pickCell`) | `setFromCamera` then manual `t` solve | pointer events only, out-of-lane `src/ui` |

- `intersectObject*` calls under `src/`: **0** (surviving mentions are comments and the test
  `test/retro-skin-seat.test.mjs:27` that pins the analytic replacement).
- Measured `raycastToPlane`-equivalent cost (setFromCamera + intersectPlane, Node 20,
  three@0.184.0): **0.12 µs/call** — ~8 µs/s at 60 fps if polled every frame.

### Entity spatial queries (already indexed)

Every hot-path proximity/radius/nearest call in `src/systems` and `src/render` routes through
`SpatialHash` (`src/core/spatialHash.js`, cell 64 wu) via `queryNearbyEntities`
(`src/core/spatialQuery.js`), `queryRadius`, `queryRadiusBatch`, or `queryRadiusCoherent`,
or the batched `createNearestEntityQueryService` (`npcJobsRuntime`). Includes collision sweeps
(`src/core/physics.js:638,684,786`), pickups/collectors (`physics.js:321,336`), docking/AI port
proximity (`aiPorts.js:332,395,1558`), AI sensors (`ai.js:553`), beacons, cruise mass-lock,
mining, masslines, and the render-side force field (`flowEnvironment.js:104`).

Instrumented golden run (20 repeats × 720 ticks = 14 400 ticks, wall 10 533 ms):

| Counter | Total | Per tick |
|---|---|---|
| `queryRadius` calls | 121 905 | 8.5 |
| `queryRadius` results returned | 145 446 | ~1.19 per call |
| `queryRadiusBatch` calls | 0 | 0 (not exercised by 47a) |
| `queryRadiusCoherent` calls | 0 | 0 (no qualifying sweeps in 47a) |
| `rebuildLayers` calls | 30 240 | 2.1 (main hash + `_projectileBroadphase`) |
| dynamic membership syncs | 470 610 | 32.7 |
| **time inside all SpatialHash query APIs** | **192 ms** | **1.82 % of wall** |

`node --cpu-prof` over the same run (11 784 ms sampled self-time): every `spatialHash.js` /
physics spatial-sync frame sums to ~314 ms ≈ **2.7 %**; dominated instead by
`economy.pricePointAt` (9.2 %), snapshot `sanitize`, `flightDynamics`, Rapier wasm, and
`saveSystem.safeStringify`. `witnessLineOfSight`, `segmentHitsProxy`, `Raycaster`,
`intersect*`, `MeshBVH`, `shapecast`: **zero samples**.

### Already-BVH / already-analytic triangle paths

- **Camera clearance** (`src/render/clearanceQuery.js`): `MeshBVH.shapecast` over a
  query-only geometry answers the 3×3 roof window; per-cell memoized in
  `renderer.js:2234` (`bvhCache`), with `rasterClearanceGrid` fallback. three-mesh-bvh
  deliberately kept off `geometry.boundsTree`/`acceleratedRaycast` (file header, lines 6–7).
  Landed as CV-GLASS-2 in `3d48adbb6`.
- **Retro-mount skin seating** (`src/render/thruster/retroSkinSeat.js`): one analytic soup
  pass replaced 28 `intersectObject` calls per attach (~1.4 s of `buildComposedShip`),
  `404d24d4d`; results cached per hull record (`retroMounts.js:134-142`). One-time cost.
- **VFX contact sampling** (`src/render/vfx.js:7374`): strided ≤128-vertex scan per submesh,
  cached 0.5 s per contact slot; only while a work-contact beam is live.

Other `fromBufferAttribute`/`index.getX` sites (`partsLibrary`, `visualFactory`,
`illustratedHullLayout`, `scenarioPropBatching`, `opticCellPresentation`,
`asteroidInteriorPreview`) are build-time geometry bakes, not queries.

### The one remaining naive spatial walk — cold, and the wrong shape for a triangle BVH

`witnessLineOfSight` (`src/combat/lineOfSight.js:59`) iterates all `state.entities` and tests
each collider's proxy primitives (circle/obb/capsule — not triangles). It runs only inside
`observeStuntWitnesses` (`src/systems/titles.js:483`) while stunt journal roots are active,
behind a ≤450 wu observer prefilter, ≤8 observers × ≤32 episodes × ≤10 sampled targets. In
the golden run it never sampled above the profiler floor. If it ever heats up in dense stunt
scenes, the correct fix is a **segment-AABB candidate pull from the existing `SpatialHash`**
(query the segment's bounding circle, then run the unchanged `segmentHitsProxy` filter) — an
entity-level index reuse, not `three-mesh-bvh`. Documented here so a future wave does not
re-derive the analysis.

## Evidence / reproduction

- Golden: `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json
  --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600` →
  `sha256 cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`, `deterministic: true`.
- Spatial counters: prototype-wrapped `SpatialHash` driver importing the same CLI (counts
  above; instrumentation outside the repo, no working-tree change).
- CPU shares: `node --cpu-prof` on the same command, self-time aggregated by function.
- `raycastToPlane` micro-bench: 200 k iterations of `setFromCamera`+`intersectPlane`.

## Disposition

KEEP nothing — there is no code to keep. The lane's work product is this report.
`three-mesh-bvh@^0.9.15` stays a dependency serving `clearanceQuery.js`; no new BVH surface
is added.
