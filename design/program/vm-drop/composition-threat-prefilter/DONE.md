# DONE — composition-threat-prefilter

## Summary

1. **Framing gate:** `playerHasActiveAttackerFraming` checks `combatCanShootPlayer`
   before `isHostileToPlayer` — quiet traffic pays the cheap lock read and skips
   the scanner hostility walk for the non-lock majority.
2. **Composition scan:** `resolveChaseComposition` computes distance + combat/lease
   lock first; far non-attackers (`d2 >= THREAT_COMPOSE_RANGE²`) never call
   `isHostileToPlayer`. Tie-break Map pass uses the same prefilter.

## Before / after

### Offline microbench (primary — portable CPU)

8000 iters; quiet Ceres-shaped shipLike (80–120 ships, 80% beyond 600 WU, 0 attackers).
Follow-pair = framing + compose (what `cam.follow` pays):

| scenario | Before | After | speedup |
|---|---:|---:|---:|
| quiet-80ships-0atk follow-pair | 34.7 ms | 16.6 ms | **~2.09×** |
| quiet-120ships-0atk follow-pair | 54.9 ms | 23.6 ms | **~2.33×** |
| combat-80ships-3atk follow-pair | 23.8 ms | 11.6 ms | **~2.06×** |

Oracle agreement before/after on nearby/active/nearest/attackers + framing bool.

Phase A cite: cpu-profile-flight `prepareFrame` ~66 ms self after #13+#44; #46 cut
fence yaw — composition hostility walk remained.

### Focused tests

`dense-scene-camera-legibility` + `camera-focus-separation` + `camera-director-governor`
+ `camera-neutral-pair` + activity suites (shared log) → **95/95** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-composition-threat-prefilter.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/composition-threat-prefilter-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Stacks under prepareFrame leftovers after #13+#44+#46.

## Risks

- Active attackers beyond compose range still pay hostility (lock prefilter keeps them).
- Ambient nearest-threat beyond 600 WU was already ignored; prefilter matches that contract.
- Tie-break still resolves Map-order winners for exact d2 ties among in-range / lock candidates.
