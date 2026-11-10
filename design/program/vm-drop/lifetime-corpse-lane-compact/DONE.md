# DONE — lifetime-corpse-lane-compact

## Summary

Quiet `lifetimeSweep` corpse compact under `registry.step` after #87: every tick
still reverse-walked the full `entityList` (hundreds of field rocks) looking for
`!alive`, even when only the flying player was pose-dirty. Cut: on quiet ticks
(no MEMBERSHIP dirty, ready entity index) scan typed death lanes only —
movables + damageables + vectorMines/snares/charges/wrecks. MEMBERSHIP dirty
(or unreadied index) fails open to the full list. Soft-GPU fps not claimed.

Hygiene so static deaths cannot leak on the quiet path: `removeEntity` marks
MEMBERSHIP; mining asteroid destroy marks MEMBERSHIP; field emitter
expiry/retire/clear marks MEMBERSHIP.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 320 asteroids + 48 movables + 4 mines × 60k
ticks × 11 isolated pairs. Before = full entityList corpse walk every tick;
after = typed-lane quiet path (pose-only dirty).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-320-asteroid-lifetime-corpse-lane (primary, 11 isolated pairs) | **~5.53×** | **≥5.20×** |

Primary: **~5.53×** median (floor minSpeedup ≥5.20×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`registry.step` / `lifetimeSweep` corpse compact residual after #87.

### Focused tests

core-player-lifetime-sweep + core-coreSystem.review + core-day-boundary-continue
+ far-actors → **19/19** pass.

mining-beam-heat-no-lockout + fields-kernel + fields-integration +
core-player-lifetime-sweep → **36/36** pass.

Functional proof: bare ship `alive=false` GCs on quiet lane path; asteroid
death with MEMBERSHIP mark GCs on fail-open full walk; remaining rocks stay.

Pre-existing unrelated miss (not this package): `activity-scheduler`
`live traffic consults the ambient hauler planner` (shouldAmbientHaulerPlan
regex) — fails on tip without this patch. Also: `pq146-tether-physics` 3/3;
`dead-wire-action-lifecycle` MINIMAL_ACTION_AUDIO 11≠10 (noted since #86/#87).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-lane-compact-quiet-lifetimeSweep-corpses-5.5.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/lifetime-corpse-lane-compact-microbench.json`
- Tests: `artifacts/focused-tests-lifetime-corpse-lane-compact.log` (+ core/extra logs)

## Apply order

Stacks under registry.step / lifetimeSweep residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83+#84+#85+#86+#87. Apply after #87.

## Risks

- Quiet path does not scan asteroids/stations/beacons; those deaths must mark
  MEMBERSHIP (removeEntity, mining, fields patches) or they wait until some
  other membership churn. Fail-open full walk whenever MEMBERSHIP is dirty.
- Lane `indexOf` per corpse is O(entityList) but corpses are rare per tick.
- Overlap between movables and damageables re-checks ships; acceptable vs
  skipping the asteroid fat list.
