# DONE — quarks-quiet-empty-update

## Summary

Quiet Quarks residual under prepareFrame / WeaponVfxPresenter after #100:
`QuarksVfxSystem.update` always called `BatchedParticleRenderer.update` for all
11 three.quarks families every frame after the last burst died. `particleNum`
was already 0 on every family; the batch walk was pure CPU.

Production trusts `_quietEmpty` after the first empty observe and returns;
cleared on spawn / `_spawnCapped`; set on `reset()`. Soft-GPU fps not claimed.
Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet update × 80k × 11 isolated pairs
(11 empty ParticleSystems registered to BatchedParticleRenderer).
Before = renderer.update every tick; after = `_quietEmpty` early-out after
first empty observe.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-quarks-all-families-empty-update (primary, 11 isolated pairs) | **~3.6×** | **≥2.81×** |

Primary: **~3.6×** median (floor minSpeedup ≥2.81× across rebenches; package
runs median 3.596 / 3.599 / 3.531, mins 2.808 / 3.168 / 3.268). Soft-GPU fps
not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
weapon presenter / prepareFrame residual on quiet settled flight.

### Focused tests

`test/quarks-vfx-system.test.mjs` + `test/debris-fragment-families.test.mjs`
→ **26/26** pass.

`check:vfx-techniques` → **9/9** PASS.

`check:vfx-force-language` → **92/92** pass.

`check:47a:debris-sling` → OK.

Wake proof: quiet latch skips renderer.update; spawnImpact clears latch and
one update advances particles (particleNum=10).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-Quarks-empty-update-3.6x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/quarks-quiet-empty-update-microbench.json`
- Tests: `artifacts/focused-tests-quarks-quiet-empty-update.log`
