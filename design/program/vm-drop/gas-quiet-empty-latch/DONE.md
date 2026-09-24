# DONE — gas-quiet-empty-latch

## Summary

Quiet settled flight still paid `resolveVfxAccessibilityProfile` /
`GasVolumeField.setAccessibility` / empty `update` every tick while
`liveCount===0`. Production now latches after the first empty observe and
wakes on `liveCount>0` (emit). Different angle from held gas-a11y
profile-id retain (~ under bar; still resolved a11y every tick).
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet empty gas a11y+update × 200k; before = unlatched resolve+set+update;
after = liveCount-wake latch. Isolated Node child processes per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-gas-empty (primary, 13 pairs) | **~2.72×** | **≥2.25×** |

Package floor capture (5×13-pair runs @ 200k): medians 2.718 / 2.650 /
2.696 / 2.739 / 2.532; mins 2.252 / 2.137 / 2.247 / 2.458 / 2.038. Floor
across package runs **≥2.038×** (clears ≥1.5× bar). Dirty-wake proved:
emitCombustion liveCount. Focused latch+gas-volume-families 28/28.
Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #123 overlay-quartet.

### Focused tests

`node --test test/gas-quiet-empty-latch.test.mjs test/gas-volume-families.test.mjs`
→ **28/28** pass (empty latch + emit wake + retire re-latch + sector clear + gas families).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-gas-empty-a11y-update.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 5 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
