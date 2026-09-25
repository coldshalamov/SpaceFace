# DONE — rcs-impulse-quiet-empty-skip

## Summary

Quiet RCS / thruster residual under prepareFrame after #97:
`RcsImpulseSystem.update` always ran eventLights begin/finalize and layer
batch clear/commit/uniform writes every frame when no impulses were alive, and
the pool zeroed the full capacity slot tail (maxImpulses × layers) every tick.
Meshes were already invisible after the frame that retired the last impulse.

After the first empty publish, production trusts `_quietEmpty` and returns.
Pool captures `prevActiveSlots` and only retires that tail. `fire()` arms
impulses before update, so the spawn frame correctly leaves the quiet path.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet update × 80k × 11 isolated pairs.
Before = capacity slot-zero + eventLights + layer batch publish every tick;
after = quiet early-out once empty published.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-rcs-already-empty-update (primary, 11 isolated pairs) | **~2.7×** | **≥1.95×** |

Primary: **~2.7×** median (floor minSpeedup ≥1.95× across rebenches; second
rebench median ~2.71× / floor ≥2.52×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
thruster / prepareFrame residual on quiet settled flight.

### Focused tests

rcs-jet-mapping + thruster-propulsion-vocabulary + vp220-propulsion-family +
dynamic-buffer-ranges + weapon-vfx-techniques → **98/98** pass.

Pre-existing unrelated: `kestrel-production-thruster-bind` 3 fails with or
without this patch (legacy HDR-energy / RCS accessibility shader / turbo shear).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-RcsImpulseSystem-empty-2.7x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/rcs-impulse-quiet-empty-skip-microbench.json`
- Tests: `artifacts/focused-tests-rcs-weapon-light-quiet-skips.log`
