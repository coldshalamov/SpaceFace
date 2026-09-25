# DONE — status-attached-quiet-empty-latch

## Summary

Quiet settled flight paid `Object.keys(combat.entities)` collect plus
Set/Map housekeeping every presented frame even with zero burn/goo
victims — contradicting the collector's own alloc-free contract. Production
now uses `for...in` + frozen `STATUS_ROW_IDS`, and latches after the first
empty collect+empty cooldown until `statusNextPendingSeq` advances.

## Before / after

### Offline microbench (primary — portable CPU)

32 combat rows × 200k quiet ticks; before = legacy Object.keys collect +
housekeeping every tick; after = latch skip while fingerprints clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-status-attached-empty-latch (primary, 11 pairs) | **~134×** | **≥126×** |

Primary package run median **137.899×** (min 131.283). Rebenches median
133.902 / 137.899 (mins 126.435 / 131.283). Floor across rebenches
**≥126.435×**. Dirty-wake proof: bump `statusNextPendingSeq` + inject burn
→ `woke: true`, latch cleared, victim found. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #105.

### Focused tests

`node --test test/status-attached-vfx.test.mjs` → **4/4** pass.

`node --test test/inf-045-target-contour.test.mjs` → **6/6** pass.

`npm run check:thruster:propulsion-family` → **68/68** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-status-attached-when-empty-134x.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
- Microbench: `artifacts/status-attached-quiet-empty-latch-microbench.json`
- Rebenches: `artifacts/status-attached-quiet-empty-latch-rebench1.json.tmp`,
  `artifacts/status-attached-quiet-empty-latch-rebench2.json.tmp`
- Tests: `artifacts/focused-tests-status-attached-quiet-empty-latch*.log`

## Apply order

Stacks under prepareFrame / vfx status-attached residual. Clean on stacked
tip through #105.

## Risks

- Relies on `statusNextPendingSeq` covering new burn/goo applies. Direct
  bag mutations that skip the pending seq would stay latched until a
  boundary clear (sector/newGame/save) or flight-mode leave. False-wake is
  safe (one collect + re-latch).
