# DONE — tumble-body-language-quiet-skip

## Summary

Quiet settled flight walked `shipPitchCandidates` every tick inside
`_updateTumbleBodyLanguageVfx` even with zero active tumble/thrownTrail.
Prior ~29× probe was held because latching on `entityIndexVersion` alone is
unsafe (tumble can start on an existing ship). Production now exposes
`pitchPresentationEpoch` from `updateShipPitchPresentation` and latches the
VFX walk after the first empty walk+empty cadence until that epoch advances.

## Before / after

### Offline microbench (primary — portable CPU)

48 shipLike rows × 200k quiet ticks; before = walk every tick; after = latch
skip while epoch clean + cadence empty.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-tumble-shipLike-walk-epoch-wake (primary, 11 pairs) | **~29×** | **≥25.9×** |

Primary package run median **28.693×** (min 25.975). Rebenches median
29.037 / 28.693 (mins 26.038 / 25.975). Floor across rebenches
**≥25.975×**. Dirty-wake proof: latch quiet → apply `status_tumbling` →
`updateShipPitchPresentation` bumps epoch → VFX wakes (`ok: true`). Soft-GPU
fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / vfx residual on quiet settled flight after #106.

### Focused tests

`node --test test/thrown-body-trail-vfx.test.mjs test/massline-presentation-uvp.test.mjs test/inactive-vfx-plan.test.mjs test/ship-pitch-presentation.test.mjs test/inf-027-tumble-recovery.test.mjs test/combat-vfx-presentation-contract.test.mjs` → **38/38** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-tumble-body-language-pitch-epoch-29x.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
- Microbench: `artifacts/tumble-body-language-quiet-skip-microbench.json`
- Rebenches: `artifacts/tumble-body-language-quiet-skip-rebench1.json.tmp`,
  `artifacts/tumble-body-language-quiet-skip-rebench2.json.tmp`
- Tests: `artifacts/focused-tests-tumble-body-language-quiet-skip.log`

## Apply order

Stacks under prepareFrame / vfx tumble body-language residual. Clean on
stacked tip through #106.

## Risks

- Relies on `updateShipPitchPresentation` running before VFX in prepareFrame
  (existing order) so the epoch bump is visible same frame. Direct
  presentation mutations that skip pitch would stay latched until a boundary
  clear or a non-empty cadence poke. False-wake is safe (one walk + re-latch).
