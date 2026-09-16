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
| 1 | Always-on incremental spatial hash | `shouldMaintainDynamicSpatialHash` never deactivates; AI sensors query the hash below 96 collidables; `queryRadius` reuses dynamic cell lists until membership changes |
| 1 | Combat SoA | `packCombatTable` each tick; PD contacts radius-query the columns |
| 1 | Dirty journal | `DIRTY.MEMBERSHIP/POSE` stamped on spawn/remove/move |
| 1 | NEAR token budget | 16 civilian S1 thinkers rotate; player and combatants always awake |
| 1 | Save-safe Rapier sleep | Non-player, non-projectile, unattached dynamics may sleep; `entity.physicsSleeping` is authoritative across save; attachments wake and hold both ends |
| 1 | Off-glass outcomes | Hostile far pairs in the same 400 wu cell resolve on a seeded delay instead of a 60 Hz dogfight |
| 2 | Packed-ORM family key | `partsLibrary` installs through `canonicalizeSurfaceProgramFamilyKey` so compile-source concatenation cannot mint a program per hull |
| 2 | After-present compile | `flushOneAfterPresent` admits one queued subject when leftover frame budget is ≥2 ms and the present was not late |
| 2 | Occupancy lights | Unchanged: 6 event + 2 weapon visible point lights |
| 3 | GPU batch | Left off. `_opaqueBatchEnabled` stays false |
| 4 | Snapshot lean | Fence packs `bank`/`pitch`; present applies hull lean from columns, not `entityRefs` |
| 4 | Platform ports | Not triggered |

## What could still improve

- Wire the dirty journal into more TABLE scanners that still walk a fat list when pose is still.
- Combat SoA is packed every tick; more radius consumers (weapons, friendly-fire lanes) still walk `shipLike`.
- Dynamic query cache is per exact cell rectangle; nearby sensors with slightly different radii still miss.
- Rapier sleep now wakes on pose resync and refuses sleep during `noInterp` teleports; it still does not skip the CPU writeback of a sleeping island.
- After-present compile still competes with leftover sim on a long frame; it yields when leftover < 2 ms.
- First-use materials that never go through packed-ORM canonicalize can still hitch; dummy prewarm stays illegal.

## Illegal here

Emptying the sky, lowering default quality, dummy prewarm, treating a receipt as a close,
re-recording goldens to pass, enabling GPU batching without a named draw-count pole.
