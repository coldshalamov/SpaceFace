# E4 — Status

Lane 2 (SIM CORE). Updated 2026-11-06.

## Done

- Diagnosis with the per-layer numbers the campaign needs (`DIAGNOSIS.md` §2). The four per-record
  JS passes around the Rapier solve are measured at **2.05 ms/tick** for 211 bodies — that is the
  first migration target, not the whole graph.
- The instrument E4's verify needs already exists: `src/core/simStepProfiler.js` reports allocation
  per tick beside per-system time, so "≤ 50 KB/tick" is a number the probe prints.

## Not started

- `EntityStore` (columns, free list, generations) and the `state.entities` facade.
- The pose-buffer format agreement with Lane 1 (PIPELINE).
- Any Rust/WASM port (gated behind the buffer rewrite by the master plan).

## Baseline to beat

| metric | before | target |
|---|---:|---:|
| worker allocation per tick | 1.55 MB | ≤ 50 KB |
| `sg02.preStep` + `readback` + `publish` | 2.05 ms/tick @ 211 bodies | ≈ 0.5 ms/tick |
| E2 step bars | not met | p95 ≤ 8 / p99 ≤ 12 / max ≤ 25 ms |

## First slice, concretely

1. `src/core/entityStore.js`: SoA columns for `x, z, vx, vz, yaw, angVel, radius, mass, team, flags,
   hull, shield`, `Int32` generation per slot, free list, `id ↔ slot` maps, and a facade object that
   satisfies `Map`-shaped use (`get`, `set`, `values`, `size`, `delete`, `has`) by materialising a
   legacy entity view on demand.
2. Migrate `_persistIslandSleep` / `_publishTelemetry` / `_syncEntityFromKinematics` (the `publish`
   pass) first: it is the smallest and it proves the column read path.
3. Digest-check every step: the 47-A tape plus `snapshotSimState` must be byte-identical before and
   after each pass moves.
