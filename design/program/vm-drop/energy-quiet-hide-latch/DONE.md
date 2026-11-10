# DONE — energy-quiet-hide-latch

## Summary

Quiet energy residual under prepareFrame / `_updateEnergy` after #102:
when plume and massline were both irrelevant, `_hideEnergyPlumes` still
ran every frame — `plasmaStream.reset()`, `retroVolume.reset()`, and
especially `fleet.reset()` (walk all ships, reset every family plume+rcs,
clear `_familyQuietAsleep` from #100). Systems were already cold; the
churn was pure CPU and undid the fleet asleep latch.

Production latches `_energyQuietHidden` after the first hide; plume /
massline wake, `_initEnergy`, `_disposeEnergy`, and
`_resetEnergyForBoundary` clear it. Soft-GPU fps not claimed. Picture
contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet `_hideEnergyPlumes` × 200k
× 11 isolated pairs (FLEET_INITIAL 10 ships × 6 families × plasma+retro
resets). Before = full reset every tick; after = latch after first hide.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-hideEnergyPlumes-consecutive (primary, 11 isolated pairs) | **~11.8×** | **≥10.3×** |

Primary: **~11.8×** median (floor minSpeedup ≥10.319× across rebenches;
package runs median 11.758 / 11.732 / 11.758, mins 10.629 / 10.319 /
10.629). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
energy / prepareFrame residual on quiet settled flight.

### Focused tests

`npm run check:thruster:propulsion-family` → **68/68** pass.

`npm run check:thruster:plasma-unit` → **26/26** pass.

`node --test` retro-thruster-integration + thruster-history-contract +
plasma-stream-thruster → **29/29** pass.

Pre-existing fails on stacked tip (unchanged without this patch):
kestrel-production-thruster-bind / player-plume-event-light (6 tests) —
not regressions from this latch.

Wake proof: latch skips consecutive hides; plumeRelevant / masslineRelevant
clear `_energyQuietHidden` before update so the next quiet hide publishes
one cold reset.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-energy-hide-11.8x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/energy-quiet-hide-latch-microbench.json`
- Tests: `artifacts/focused-tests-energy-quiet-hide-latch.log`,
  `artifacts/focused-tests-energy-quiet-hide-retro-plasma.log`

## Apply order

Independent of #102. Stacks under prepareFrame / vfx energy residual.
Clean on stacked tip through #102. Prefer apply after #102 for digest order.

## Risks

- Relies on plume/massline wake clearing `_energyQuietHidden` before
  `_updateEnergyPlume` / `_updateEnergyMassline`. Boundary reset forces
  one hide publish. Init/dispose clear the latch so cook+rest still cold-
  publishes once.
