# DONE — energy-bolt-quiet-begin-commit

## Summary

Quiet EnergyBolt residual under prepareFrame / WeaponVfxPresenter after #101:
`_syncBolts` always called `beginFrame` (Map.clear + `uBoltTime`/`uBoltFlicker`
writes) and `commit` (sort gate + 7-attr needsUpdate / dynamic-buffer republish)
every frame after the last bolt left the glass. Mesh was already `count===0` /
invisible; the churn was pure CPU.

Production defers begin while `_quietEmpty`; `writeBolt` flushes the deferred
begin (or wakes without one); quiet commit drops the deferred begin and latches.
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet beginFrame+commit × 200k × 11
isolated pairs. Before = Map.clear + uniforms + commit attr republish every
tick; after = `_quietEmpty` early-out after first empty publish.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-energy-bolt-begin-commit-latch (primary, 11 isolated pairs) | **~4.5×** | **≥3.82×** |

Primary: **~4.5×** median (floor minSpeedup ≥3.82× across rebenches; package
runs median 4.538 / 4.598 / 4.260 / 4.173 / 4.457, mins 3.986 / 4.249 / 3.919 /
3.825 / 3.875). Soft-GPU fps not claimed.

Prior commit-only model (~1.41×) held under bar — superseded by this fuller
begin+commit latch.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
weapon presenter / prepareFrame residual on quiet settled flight.

### Focused tests

`test/weapon-vfx-techniques.test.mjs` → **16/16** pass.

`check:vfx-techniques` → **9/9** PASS.

`check:vfx-force-language` → **92/92** pass.

Wake proof: quiet latch defers begin / drops commit; `writeBolt` flushes
deferred begin and one commit draws (mesh.count=1).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-EnergyBoltPool-begin-commit-4.5x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/energy-bolt-quiet-begin-commit-microbench.json`
- Tests: `artifacts/focused-tests-weapon-vfx-techniques.log`

## Apply order

Independent of #101. Stacks under prepareFrame / WeaponVfxPresenter residual.
Clean on stacked tip through #101. Prefer apply after #101 for digest order.

## Risks

- Relies on `writeBolt` flushing `_deferredBegin` / clearing `_quietEmpty` on
  every wake path (sole write entry). Live→empty still publishes mesh.count=0
  once before latching.
