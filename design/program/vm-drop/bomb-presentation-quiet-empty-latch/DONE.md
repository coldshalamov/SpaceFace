# DONE — bomb-presentation-quiet-empty-latch

## Summary

After the first bomb creates the lazy telegraph owner, quiet settled flight
still paid frustum rebuild + a11y resolve + source walk +
`setDrawRange(0)` / `visible=false` every tick with no live bombs (mesh
already invisible). Production now latches after the first empty publish
and skips until `entityIndexVersion` bumps. Soft-GPU fps not claimed.
Without a versioned entity index the latch refuses (entityList fallback
stays live).

## Before / after

### Offline microbench (primary — portable CPU)

Empty bomb-telegraph ticks × 200k after owner exists; before = frustum +
a11y + empty walk + publish(0) every tick; after = latch skip while
version clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-bomb-telegraph-empty-after-owner (primary, 11 pairs) | **~2.6×** | **≥2.15×** |

Package floor capture (4×11-pair runs): medians 2.553 / 2.762 / 2.518 / 2.615;
mins 2.347 / 2.471 / 2.15 / 2.248. Floor across package runs **≥2.15×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → version bump + bomb →
update resumes → re-latch after drain (`ok: true`). Soft-GPU fps not
claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / ordnance residual on quiet settled flight after #113.

### Focused tests

`node --test test/bomb-presentation-quiet-empty-latch.test.mjs test/bomb-presentation.test.mjs`
→ **9/9** pass.
Also `test/ordnance-motion-presentation.test.mjs` → **35/35**;
`test/bomb-choreography.test.mjs` → **20/20**;
`test/inactive-vfx-plan.test.mjs` → **1/1**.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-bomb-telegraph-2.6.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
