# DONE — law-heat-telegraph-quiet-skip

## Summary

Quiet settled flight still paid `resolveVfxAccessibilityProfile` +
`lawHeatTelegraph.update` + `stamp()` object alloc + light-pool
find/release every tick with no live scan/suspicion/WANTED cue. Production
now latches after the first empty publish and skips until a scan/heat accept
bumps the wake seq. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

6-slot light pool × 200k quiet law-heat ticks; before = a11y + update +
stamp alloc + 2–3 pool finds every tick; after = latch skip while wake seq
clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-law-heat-telegraph-idle-latch (primary, 11 pairs) | **~3.6×** | **≥2.99×** |

Package floor capture (3×11-pair runs): medians 3.809 / 3.661 / 3.611;
mins 3.350 / 3.272 / 2.986. Floor across package runs **≥2.986×** (clears
≥1.5× bar). Dirty-wake proof: latch quiet → scan/heat wakeSeq bump → update
resumes (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #109.

### Focused tests

`node --test test/law-heat-telegraph-quiet-skip.test.mjs test/law-heat-telegraph-vfx.test.mjs test/inactive-vfx-plan.test.mjs test/docking-cradle-quiet-skip.test.mjs test/vfx-save-restore-destroy.test.mjs` → **18/18** pass.
Also `test/status-attached-vfx.test.mjs` → **4/4** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-law-heat-telegraph-3.6.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
