# E4 — Data-oriented core: diagnosis and first-slice plan

Lane 2 (SIM CORE). 2026-11-06.

## 1. The player-visible problem

Same problem as E2, one scale further out: the step cost grows with bodies, and the game must hold
the E2 bars with 2× the bodies. Point fixes in the object graph stop scaling because every body is a
JS object and every per-tick concern is its own pass over those objects.

## 2. Measured cause chain (this laptop, 211 bodies, production manifest)

From `.devshots/sim-step-profile/before-adventure.json` and the sub-phase probe:

| layer | ms/tick | note |
|---|---:|---|
| Rapier solve (`sg02.worldStep`) | 1.22 | the actual physics |
| `sg02.preStep` | 0.75 | per-record command/force prep |
| `sg02.publish` | 0.69 | enforce plane, clamp, entity sync, telemetry |
| `sg02.readback` | 0.61 | post-step WASM reads + structural give |
| authority sync / fence | 0.86 | per-entity membership + activity classification |
| spatial-hash rebuild | 0.17 | |
| **total `physics`** | **4.76** | solver is 26 %, JS glue 74 % |

Worker allocation: **1.55 MB per tick** (~93 MB/s) — the E4 verify bar is ≤ 50 KB/tick.

So the design *is* the bottleneck for scale: four separate passes over the same 200–400 body
objects, each touching `entity.*` and `rec.*` through pointers, each allocating.

## 3. Is replacing the design the cheaper road?

For the E2 bars: no. This campaign's own rule is to optimise what the profiler ranks top-five, and
the top five are fixable in place (E2). For the *2× bodies* bar: yes — and Rapier already takes flat
typed buffers, so the bridge cost is zero once the columns exist.

Cost: an entity store with stable indices + generation counters, component columns for the hot
fields (position, velocity, rotation, radius, mass, team, flags, health), `state.entities` kept as a
**facade** during migration, hottest systems ported first, facade deleted last. Multi-session.
Bought: the 2.9 ms of physics glue collapses into tight loops over typed arrays, allocation per tick
falls by an order of magnitude, and a Rust/WASM port of a single loop becomes mechanical.

## 4. Chosen road (order)

1. **Columns first, facade always.** One `EntityStore` owning `Float64Array`/`Int32Array` columns,
   `index ↔ entity` maps, free-list with generation. Facade `state.entities` keeps today's API
   (`get/set/values/size`) for the 1.27 M lines that must not break at once.
2. **Move one pass at a time, verified by digest.** The first candidate is `sg02.preStep` →
   `sg02.readback` → `sg02.publish`, because together they are 2.05 ms/tick and they are a closed
   loop over the same records.
3. **Snapshot to presentation is a buffer copy.** Agree the buffer layout with Lane 1 (PIPELINE)
   before touching the pose writer; the format must carry the same fields the journal carries now
   (id, x, z, yaw, vx, vz, wy, revision) so E1's jitter buffer can consume it unchanged.
4. **Rust/WASM gate** stays as written in the master plan: only after the buffer rewrite, and only
   if the profiler still shows ≥ 1 ms/tick in that loop.

Wrong ways this campaign will not take: a big-bang rewrite with no facade; a second parallel store;
porting to Rust before the layout is fixed.

## 5. Status

Not started. The profiler and the sub-phase split from E2 are the required inputs and exist now;
`sg02.preStep`/`readback`/`publish` are named and measured as the first target. See
[`STATUS.md`](./STATUS.md).
