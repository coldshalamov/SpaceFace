# DONE — field-force-quiet-empty-latch

## Summary

Quiet settled flight still paid frustum rebuild + 10-slot reserved walk +
`batch.begin`/`end` `commitDynamicBufferOwner(0)` every tick with no live
field surfaces (mesh already count=0/visible=false after residue drains).
Production now latches after the first empty publish and skips until
`fields.active` gains an entry or a residual releasing slot remains.
Soft-GPU fps not claimed. Release residue still updates until slots clear.

## Before / after

### Offline microbench (primary — portable CPU)

Empty field-force ticks × 200k; before = frustum + slot walk + commit(0)
every tick; after = latch skip while wake clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-field-force-empty-frustum+commit0 (primary, 11 pairs) | **~2.5×** | **≥1.94×** |

Package floor capture (4×11-pair runs): medians 2.59 / 2.476 / 2.46 / 2.59;
mins 2.193 / 1.94 / 2.223 / 2.193. Floor across package runs **≥1.94×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → `fields.active` push →
update resumes → re-latch after release drains (`ok: true`). Soft-GPU fps
not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #112.

### Focused tests

`node --test test/field-force-quiet-empty-latch.test.mjs test/vfx-field-lifecycle.test.mjs test/vfx-force-language.test.mjs test/inf-043-pull-push-language.test.mjs` → **44/44** pass.
Also `test/vfx-shield-shell-and-field-material.test.mjs` → **7/7**;
`test/inactive-vfx-plan.test.mjs` → **1/1**.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-field-force-surfaces-2.5.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
