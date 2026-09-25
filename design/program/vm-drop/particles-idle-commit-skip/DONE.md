# DONE — particles-idle-commit-skip

## Summary

Quiet particle integrate residual under prepareFrame / VFX after #89:
`vfx.update` always invoked `_integrateParticles` even when `liveCount===0`,
paying `assertDynamicBufferOwnerWritable` + `commitDynamicBufferOwner(0)`
(7 bindings sweep) every frame after the cloud was already empty. `mesh.count`
was already 0 after the first idle commit, so republish was pure CPU with no
picture effect.

Production now remembers `_particlesPublishedIdle` after the first quiet
commit(0) and returns until `_activateParticle` (or a quality resize that keeps
live particles) clears the flag.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet commit (7 bindings) × 200k
integrates × 11 isolated pairs. Before = assert+commit every tick; after =
skip once published idle.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-particles-idle-commit-skip (primary, 11 isolated pairs) | **~2.3×** | **≥2.20×** |

Primary: **~2.31×** median (floor minSpeedup ≥2.20×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`_integrateParticles` / shard commit under prepareFrame/VFX on quiet settled
flight.

### Focused tests

`vfx-save-restore-destroy` + `quarks-vfx-system` + `vfx-structured-transients`
→ **15/15** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-skip-idle-particle-commit-republish-2.3x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/particles-idle-commit-skip-microbench.json`
- Tests: `artifacts/focused-tests-particles-idle-commit-skip.log`

## Apply order

Independent of #90/#91. Stacks under prepareFrame / VFX residual. Clean on
stacked tip through #89. Prefer apply after #89 (ArcadeStructuralFx) for
digest order only.

## Risks

- Relies on `_particlesPublishedIdle` clearing on every spawn path that uses
  `_activateParticle` (sole activate helper). Quality resize sets the flag from
  `keep`. Invalid-owner early path still zeroes mesh.count without the flag —
  next integrate republishes once.
