# DONE — swing-trace-quiet-idle-skip

## Summary

Quiet settled flight still paid tether resolve +
`resolveVfxAccessibilityProfile` + `writeMasslineSwingTraceGeometry` every
tick with no live latch and empty fade/count. Production now latches after
the first empty publish and skips until a player/remote tether becomes
live. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

96-sample capacity × 200k quiet swing-trace ticks; before = tether resolve
+ a11y + geometry write every tick; after = latch skip while tether.active
clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-swing-trace-idle-latch (primary, 11 pairs) | **~1.87×** | **≥1.58×** |

Package floor capture (4×11-pair runs): medians 1.765 / 1.868 / 1.854 /
1.923; mins 1.584 / 1.710 / 1.754 / 1.640. Floor across package runs
**≥1.584×** (clears ≥1.5× bar). Dirty-wake proof: latch quiet →
tether.active wake → update resumes (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #110.

### Focused tests

`node --test test/swing-trace-quiet-idle-skip.test.mjs test/massline-release-arc.test.mjs test/massline-presentation-uvp.test.mjs test/docking-cradle-quiet-skip.test.mjs test/law-heat-telegraph-quiet-skip.test.mjs test/inactive-vfx-plan.test.mjs test/vfx-save-restore-destroy.test.mjs` → **26/26** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-massline-swing-trace-1.9.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
