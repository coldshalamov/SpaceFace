# DONE — stunt-threat-index-lanes

## Summary

`StuntFlightObserver.update` threat scan walks `entityIndex` ships / drones /
projectiles lanes instead of `state.entities.values()`. Quiet Ceres rocks and
pickups never enter the threat walk. History body gather prefers
`spatialDynamics` / `movables` when the index is ready. Fallback keeps the
typed full-list scan when the index is absent (tests / stripped hosts).

## Before / after

### Portable microbench (primary KPI)

Ceres-ish mix: 845 entities (800 rocks + 24 ships + 8 drones + 12 projectiles),
8000 scan iters, identical hit count (44):

| mode | wall ms | vs full |
|---|---:|---:|
| full `entities.values` + type gate | 56.9 | — |
| **index lanes** | **3.5** | **~16.4×** |

Soft-GPU fps not claimed. Hitch/worst not claimed this package (portable CPU).

### Focused tests

`stunt-combo` + `stunt-taxonomy` + `pq-155-03-stunts-pay` → **20/20**.
(`pq146-flight-evidence` kickstart classify already red on stacked tip without
this change — not regressed here.)

GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-combat-stunt-threat-scan-entity-index-lanes.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ `7c931c2d3418637c770ea85c1640f0e50faff850`
- Microbench: `artifacts/stunt-threat-index-lanes-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured on post-import stack over master `7c931c2d3` / master tip `37f50a70d`

## Apply order

Independent of opening/hitch packages. Stacks after `stunt-flight-range-prefilter`
(range gate still applies inside the lane walk).

## Risks

- Stub `entityIndex` with `ready: true` but empty lanes would miss threats —
  production index always mirrors live ships/drones/projectiles; tests without
  an index keep the typed full-list fallback.
