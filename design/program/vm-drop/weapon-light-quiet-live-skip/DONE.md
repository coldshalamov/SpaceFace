# DONE — weapon-light-quiet-live-skip

## Summary

Quiet weapon-light residual under prepareFrame / WeaponVfxPresenter after #98:
`WeaponLightPool.update` always walked CAP (2) slots and wrote intensity=0
every frame when no lights were alive. Intensities were already 0 after the
frame that retired the last flash.

Production trusts `_live` (spawn ++ when taking a dead slot; retire --;
dispose clear) and returns immediately when live===0.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet update × 400k × 11 isolated pairs.
Before = 2-slot walk + intensity=0 every tick; after = live===0 early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-weapon-light-live-zero-update (primary, 11 isolated pairs) | **~1.60×** | **≥1.46×** |

Primary: **~1.60×** median (floor minSpeedup ≥1.46× across rebenches). Soft-GPU
fps not claimed. Absolute CAP=2 cost is small; shipped as a clear portable
ratio win on the named residual.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
weapon presenter residual under prepareFrame on quiet settled flight.

### Focused tests

rcs-jet-mapping + thruster-propulsion-vocabulary + vp220-propulsion-family +
dynamic-buffer-ranges + weapon-vfx-techniques → **98/98** pass.

Pre-existing unrelated: `kestrel-production-thruster-bind` 3 fails with or
without this patch.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-WeaponLightPool-live-0-1.6x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/weapon-light-quiet-live-skip-microbench.json`
- Tests: `artifacts/focused-tests-rcs-weapon-light-quiet-skips.log`
