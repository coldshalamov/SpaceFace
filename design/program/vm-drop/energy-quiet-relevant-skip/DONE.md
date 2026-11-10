# DONE — energy-quiet-relevant-skip

## Summary

Quiet energy residual under prepareFrame / `_updateEnergy` after #103:
when `_energyQuietHidden` was already latched, every idle tick still ran
full `_energyPlumeRelevant` — player `_engineDriveFor` plus a trail-
candidate walk calling `_engineDriveFor` per idle NPC — before the hide
early-return. Pure probe CPU on quiet settled flight.

Production adds `_energyQuietMaybeAwake` (input / actuators / throttle /
boost / speed-proxy; no full drive walk). While hide-latched, `_updateEnergy`
returns false unless maybe-awake or massline wake; false-wake falls through
to full relevant and the hide latch still early-returns. Soft-GPU fps not
claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet-hidden `_updateEnergy` probe
× 200k × 11 isolated pairs (player idle + 8 idle trail-candidate ships).
Before = full `_energyPlumeRelevant` every tick; after = cheap maybe-awake
while latched.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-hidden-energy-relevant-probe (primary, 11 isolated pairs) | **~4.3×** | **≥3.1×** |

Primary: **~4.3×** median (floor minSpeedup ≥3.138× across rebenches;
package run median 4.339, min 3.897, max 6.595; prior rebenches median
4.287 / 4.712, mins 3.138 / 4.160). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
energy / prepareFrame residual on quiet settled flight.

### Focused tests

`npm run check:thruster:propulsion-family` → **68/68** pass.

`npm run check:thruster:plasma-unit` → **26/26** pass.

`node --test` retro-thruster-integration + thruster-history-contract +
plasma-stream-thruster → **29/29** pass.

Pre-existing fails on stacked tip (unchanged without this patch):
kestrel-production-thruster-bind / player-plume-event-light — not
regressions from this skip.

Wake proof: maybe-awake is conservative (may false-wake into full
relevant); hide latch early-returns on false-wake. Real thrust / coast
speed-proxy / massline clear the quiet path into full relevant.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-energy-relevant-when-hide-latched-4.3x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/energy-quiet-relevant-skip-microbench.json`
- Tests: `artifacts/focused-tests-energy-quiet-relevant-skip.log`,
  `artifacts/focused-tests-energy-quiet-relevant-skip-retro-plasma.log`

## Apply order

Depends on #103 (`_energyQuietHidden`). Stacks under prepareFrame / vfx
energy residual. Clean on stacked tip through #103.

## Risks

- Relies on maybe-awake covering production wake thresholds (input,
  actuators, throttle, boost, speedDrive bands). False-wake is safe
  (full relevant + hide latch). Boundary / init / dispose still clear
  the hide latch via existing #103 paths.
