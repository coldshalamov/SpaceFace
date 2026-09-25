# DONE — trail-emit-idle-drive-walk

## Summary

Quiet settled flight walked all shipLike trail candidates through
`_engineDriveFor` every emit tick (~60 Hz) even with every drive below the
idle band (`drive < 0.055`). Production now latches after the first empty
emit and skips the drive walk until a cheap maybe-awake fires. Empty
`_updateRibbonTrails` shares the latch when `_ribbonTrails.size === 0`
(retiring wakes still run while the map is non-empty).

## Before / after

### Offline microbench (primary — portable CPU)

48 shipLike rows × 200k quiet emit ticks; before = `_engineDriveFor`-like
walk every tick; after = latch skip while maybe-awake clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-trail-emit-idle-drive-latch (primary, 11 pairs) | **~7×** | **≥4.0×** |

Package floor capture (3×11-pair runs): medians 7.231 / 6.843 / 6.977;
mins 6.09 / 6.597 / 3.998. Floor across package runs **≥3.998×** (still
clears ≥1.5× bar; typical pair floor ≥6.0×). Dirty-wake proof: latch quiet
→ apply throttle/main → maybeAwake wakes → emit resumes (`ok: true`).
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #107.

### Focused tests

`node --test test/trail-streak-instancing.test.mjs test/ribbon-trail-compile-latch.test.mjs test/ribbon-trail-head-glue.test.mjs test/inf-022-wing-trails.test.mjs test/thruster-propulsion-vocabulary.test.mjs test/inactive-vfx-plan.test.mjs test/contrail-corkscrew.test.mjs test/plasma-stream-thruster.test.mjs test/retro-thruster-integration.test.mjs test/thruster-history-contract.test.mjs` → **71/71** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-trail-emit-drive-walk-7x.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
