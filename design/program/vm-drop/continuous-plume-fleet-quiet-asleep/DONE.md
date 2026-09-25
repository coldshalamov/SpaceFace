# DONE — continuous-plume-fleet-quiet-asleep

## Summary

Quiet continuous-plume residual under prepareFrame / thruster energy after #99:
`FamilyProductionFleet.endFrame` re-zeroed pool begin/endWrite + 5-layer mesh
`count=0` / `visible=false` for every sleeping engine family (6 recipe packs)
every frame after the first empty publish. Player hero exhaust is the plasma
stream (0 continuous sockets), so quiet settled flight leaves all families
asleep and still paid the re-zero.

Production trusts `_familyQuietAsleep` after the first sleep publish and
returns; cleared when a family opens / on `reset()`. `ContinuousPlumeSystem`
also trusts `_quietEmpty` after the first empty GPU publish on
`update` / `endUpdate` (event-light + layer batch clear/commit/uniforms).

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet fleet endFrame × 200k × 11
isolated pairs (6 families × 5 layers, all asleep).
Before = every sleeping family re-zeros pool + layers every tick; after =
`_familyQuietAsleep` early-out after first sleep publish.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-6family-all-asleep-endFrame (primary, 11 isolated pairs) | **~3.1×** | **≥2.18×** |

Primary: **~3.1×** median (floor minSpeedup ≥2.18× across rebenches; final
package run median 3.094 / min 2.672). Soft-GPU fps not claimed.

Secondary (ContinuousPlumeSystem.update already-empty): **~2.0×** median
(floor ≥1.68×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
thruster / prepareFrame residual on quiet settled flight.

### Focused tests

`check:thruster:propulsion-family` (vp220 p1/p2/p3 + propulsion-family) →
**68/68** pass.

rcs-jet-mapping + dynamic-buffer-ranges + plume-spin-wobble +
plasma-stream-thruster + thruster-propulsion-vocabulary → **98/98** pass.

Pre-existing unrelated: `kestrel-production-thruster-bind` 3 fails with or
without this patch.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-sleeping-ContinuousPlume-fami.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/continuous-plume-fleet-quiet-asleep-microbench.json`
- Secondary: `artifacts/continuous-plume-quiet-empty-update-microbench.json`
- Tests: `artifacts/focused-tests-continuous-plume-fleet-quiet-asleep.log`
