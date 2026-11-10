# DONE — fields-npc-plan-cadence

## Summary

1. **NPC plan cadence:** live NPC cone geometry still updates every tick; the all-ship
   discover walk (`applyNpcFieldPlan` over `aiShips`) runs every
   `NPC_FIELD_PLAN_PERIOD_TICKS` (4). Live owners still refresh/retire every tick.
2. **Quiet idle early-out:** after input + skim sync, if no cone/deployed/anchored/npc/skim
   and the kernel is empty, skip cone/anchor/orbit/force and only run the cadenced discover.

## Before / after

### Offline microbench (primary — portable CPU)

80 AI ships / 30 wrecks / 6000 ticks; quiet (no live NPC fields):

| | Before (plan every tick) | After (period 4) |
|---|---|---|
| plan calls | **480000** | **120000** |
| wall | **22.2 ms** | **8.3 ms (~2.67×)** |

Phase A cite: cpu-profile-flight `fields.update` ~124 ms inclusive under `registry.step`.

### Focused tests

`pq147-01-fields-for-everyone` + `pq-147-01-fields-physics` → **7/7** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-fields-npc-plan-cadence-quiet-idle.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/fields-npc-plan-cadence-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Stacks under registry.step residual after #39.

## Risks

- New scavenger cones may take up to 4 ticks (~67 ms) to discover after entering loose mass.
- Live cone hold/retire remains every tick.
- Skim sheet still syncs before the idle gate so collector-on arms without a prior field.
