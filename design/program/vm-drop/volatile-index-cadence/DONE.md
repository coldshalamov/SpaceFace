# DONE — volatile-index-cadence

## Summary

Quiet preStep rebuilt `entityIndex.aiShips` and `weaponShips` from `index.ships`
every tick. append/remove already keep those lanes correct for spawn/despawn;
the every-tick walk only existed to catch rare mid-life ai/weapons attach.

Production now rebuilds on an **8-tick cadence** (`VOLATILE_INDEX_PERIOD_TICKS`).
`clearEntityIndex` clears `_volatileReady` so the next preStep refills.

## Before / after

### Offline microbench (primary — portable CPU)

120 ships × 24k ticks; before = every-tick rebuild; after = 8-tick cadence.

| | Before | After | |
|---|---:|---:|---|
| wall | 37.4 ms | 8.4 ms | **~4.46×** |
| refreshes | 24000 | 3000 | 8× fewer |
| oracle mid-life admit | — | tick 8 | within period |

Primary: **~4.46×**. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924t`
(Picture ON): idle **57.9%**, long tasks **15**; `refreshVolatileEntityIndex`
~34 self samples under `core.preStep` / `registry.step`.

### Focused tests

entity-lifecycle-residency-recycle + core-coreSystem.review +
pq-148-01-volatile-classes + performance-lifecycle-contracts +
starter-weapon-runtime + systems-weaponsAttackRuntime.review → **pass**
(dirty-range fingerprint fail is pre-existing `node_modules` noise).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-cadence-volatile-ai-weapon-index-rebuild.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/volatile-index-cadence-microbench.json`
- Tests: `artifacts/focused-tests-volatile-index-cadence.log`

## Apply order

Independent. Prefer after #55. Stacks under registry.step / preStep residual.

## Risks

- Mid-life first attach of `data.ai` / `data.weapons` on an already-indexed ship
  can take up to 8 ticks (~133 ms) before appearing in aiShips/weaponShips.
  Spawn-time membership stays immediate via append/remove.
- Callers that expected same-tick volatile visibility after mutating `data.ai`
  without a spawn must wait for the cadence (none asserted in focused suite).
