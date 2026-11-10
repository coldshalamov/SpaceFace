# DONE — persistent-beams-quiet-callsite-skip

## Summary

Quiet settled flight still paid `Math.hypot(cam)` + `resolveVfxAccessibilityProfile`
+ `worldSizeForPixels` every tick before `PersistentCombatBeamPool.update` early-out
when `activeCount===0` (#91). Production now gates the call site on `activeCount`
so empty flight skips that prep. Upsert / stop / clear keep the counter truthful
(dirty-wake). Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet activeCount===0 call × 400k; before = camDist + a11y + worldSize + pool
early-out; after = activeCount gate at call site. Isolated Node child processes
per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-combat-beams-callsite-prep (primary, 13 pairs) | **~5.0×** | **≥4.02×** |

Package floor capture (4×13-pair runs @ 400k): medians 5.15 / 4.94 / 5.06 / 5.11;
mins 4.60 / 4.63 / 4.20 / 4.87. Floor across package runs **≥4.20×** (clears ≥1.5×
bar). Dirty-wake proved: empty skip → upsert(beamKey) → update resumes → stop/clear
re-skips (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #120 well-distortion; stacks on
#91 pool early-out (different layer: call-site prep, not capacity walk).

### Focused tests

`node --test test/persistent-beams-quiet-callsite-skip.test.mjs
test/persistent-combat-beam-pool.test.mjs`
→ **7/7** pass (latch dirty-wake 3/3 + pool suite 4/4).

## Evidence

- Patch: `patches/0001-perf-render-skip-quiet-combat-beam-callsite-prep.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 4 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
