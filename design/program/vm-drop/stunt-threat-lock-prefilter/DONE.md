# DONE — stunt-threat-lock-prefilter

## Summary

1. **Lock prefilter:** `hostileThreat` checks combat/activity `targetId === player`
   before `isHostileForAI` for ships/drones. Projectiles still resolve owner hostility.
2. **Quiet cadence:** when `tracks.size === 0` and the indexed projectile lane is
   empty, the threat walk runs every other tick. Active tracks or live projectiles
   keep the every-tick walk.

## Before / after

### Offline microbench (primary — portable CPU)

8000 iters; post-#40 index lanes; quiet Ceres-shaped (120 ships + 10 drones, 0 attackers):

| scenario | Before | After | speedup |
|---|---:|---:|---:|
| quiet-120ships-0atk (lock+cadence2) | 28.5 ms | 13.9 ms | **~2.04×** |
| combat-80ships-3atk active tracks (lock only) | 21.4 ms | 13.1 ms | **~1.63×** |
| combat + 6 projectiles (lock only, no cadence) | 21.9 ms | 17.0 ms | ~1.29× |

Oracle agreement before/after on threat hit counts (full-scan ticks).

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924h` —
`StuntFlightObserver.update` **92 hits** under `registry.step` (top child after preStep).

### Focused tests

`stunt-combo` + `stunt-taxonomy` + `pq-155-03-stunts-pay` → **20/20** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-stunt-threat-lock-prefilter.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/stunt-threat-lock-prefilter-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Stacks under registry.step residual after #39+#43+#40.
**vm-drop note:** tip previously had #40 package docs only — this ship also lands
`stunt-threat-index-lanes` (+ master range-prefilter) source into `stuntFlightEvidence.js`.

## Risks

- First open of a ship/drone threat episode may delay up to one tick (~16 ms) while
  quiet (no tracks, no projectiles). Open-window is 0.2–1.2 s — safe.
- Fallback hosts without a ready entityIndex never cadence (projectiles lane null).
- Projectiles still pay owner `isHostileForAI` every tick when the lane is non-empty.
