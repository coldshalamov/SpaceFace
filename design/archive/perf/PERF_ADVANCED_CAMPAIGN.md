<!-- LIFETIME: DURABLE -->
# PQ-204 — Deterministic smoothness campaign

Owner instruction 2026-09-16: there is never a quiet machine. Ship small deterministic algorithms
and prove them with tests. A headed census is not a gate.

Packet: [`roadmap/active/PQ-204.md`](./roadmap/active/PQ-204.md).
Prompt: [`PERF_ADVANCED_GOAL.txt`](./PERF_ADVANCED_GOAL.txt).
Dispatch: `node scripts/program-dispatch.mjs --id PQ-204`.

## Picture contract

Bloom, shadows, particles, and authored bodies stay on. Dummy shader prewarm is illegal.
Retained-slot `BatchedMesh` stays off until a crowded fly names draw-count as the pole.
WASM SIMD / Worker / WebGPU stay off until waves 1–3 miss p99 on that same fly.

## What shipped

| Wave | Algorithm | Live path |
|---|---|---|
| 1 | Always-on incremental spatial hash | Hash never deactivates; projectile and ship sweeps use `queryRadiusCoherent`. A later query whose cell rectangle is inside the last one reuses the neighbor list. Sleeping still dynamics skip cell-span until they move or `noInterp` teleports |
| 1 | Combat SoA | `packCombatTable` includes ships, projectiles, and wrecks; AI sensors, beams, fields, PD, mines, and tether range read columns. Still frames reuse last packed columns. A teleport without velocity dirties pose so columns do not skip-repack. NPC fire/heat walks `weaponShips`. Beacon lure uses the spatial hash; claim-sling NPC boosts walk `shipLike` |
| 1 | Dirty bitsets | Per-id `Uint32Array` bits + generation skip; lifetime, combat regen, and mining magnet iterate set bits |
| 1 | NEAR token budget | Count-based slice (not wall time) for traffic, law ambient, npcJobs threat, and scanner ghosts; leftover resumes in stable ID order |
| 1 | Save-safe Rapier sleep | Only off-glass / S2–S4 dynamics may sleep; S0/S1 table collisions stay awake; `physicsSleeping` + `physicsIslandId` persist on the entity. Sector fence uses corridor/sector playable bounds when the boot Helios disk cannot contain `currentSectorId`. Sleeping islands skip WASM pose writeback, expected-kinematics capture, force reset, pose resync, and redundant `setCanSleep` / `wakeUp`. Still NPCs skip flight commands, field plans, weapon service, and interpolation snapshots |
| 1 | Off-glass outcomes | Far hostile pairs drift with `worldCatchup.ballisticDrift` and resolve under `encounterCausality` fingerprints |
| 2 | Packed-ORM family key | `partsLibrary` installs through `canonicalizeSurfaceProgramFamilyKey` |
| 2 | After-present compile | One queued subject after present, then one real next-contact hull from traffic intent. Hitch / present-first frames run leftover sim first and only compile with remaining budget |
| 2 | In-flight admission | Mesh builds time-sliced; `reconcileMeshes` no longer promotes on the present beat. `tickFarActors` still promotes at table enter. |
| 2 | Binary program cache | `WEBGL_get_program_binary` wrap on the live GL context; dummy prewarm stays illegal |
| 2 | Occupancy lights | Unchanged: 6 event + 2 weapon visible point lights |
| 3 | GPU batch | Left off. `_opaqueBatchEnabled` stays false |
| 4 | Snapshot fence | Present pose/visibility uses packed flags + fence columns; no `state.entities.get` on the pose path |
| 4 | Platform ports | WASM SIMD / Worker / WebGPU not triggered |
| follow-on | Hidden skip + arrival slice | Map/station/pause skip full-tick systems; input/save stay alive. Neighbor residency and leftover `sector:enter` listeners drain after present |

## What could still improve

- First-use materials that never go through packed-ORM canonicalize can still hitch; dummy prewarm stays illegal. `partsLibrary` is live on PQ-193.09.
- GPU batching stays off until a crowded fly names draw-count.
- Hangar occupancy still walks the fat list (a real hangar-jam path).

## Illegal here

Emptying the sky, lowering default quality, dummy prewarm, treating a receipt as a close,
re-recording goldens to pass, enabling GPU batching without a named draw-count pole.
