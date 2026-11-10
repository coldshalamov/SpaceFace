# DONE — weapon-ribbon-quiet-live-skip

## Summary

Quiet weapon-ribbon residual under prepareFrame / WeaponVfxPresenter after
#96: `ribbons.update` always walked CAP (256) linger slots and ran
`_writeVertices` (cleared-slot scan) every frame when no wakes were alive.
Mesh was already visible=false and slots cleared after the frame that
retired the last wake.

Production trusts `live` (spawn ++ when taking a dead slot; linger-retire
--; dispose clear) and returns immediately when live===0. The retirement
frame still clears alphas via `_writeVertices`.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet update × 200k × 11 isolated
pairs. Before = capacity walk + publish every tick; after = live===0 early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-weapon-ribbon-live-zero-update (primary, 11 isolated pairs) | **~64.8×** | **≥59.40×** |

Primary: **~64.8×** median (floor minSpeedup ≥59.40× across rebenches). Soft-GPU
fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
weapon presenter residual under prepareFrame on quiet settled flight.

### Focused tests

weapon-vfx-techniques + vfx-well-distortion + impact-event-grammar + render-ribbonPool.review + ribbon-trail-* → **54/54** pass.

Pre-existing unrelated: `vfx-mach-tracers` "grazing kinetic hits skip" fails
with or without this patch (`_c0` undefined in `_emitArmorSpall` harness).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-WeaponRibbonPool-live-0-65x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/weapon-ribbon-quiet-live-skip-microbench.json`
- Tests: `artifacts/focused-tests-weapon-vfx-quiet-live-skips.log`

## Apply order

Independent of siblings. Stacks under prepareFrame / weapon presenter residual.
Clean on stacked tip through #94. Prefer apply after #96 for digest order.

## Risks

- Relies on `live` staying in sync: coalesce into already-alive slot does not
  ++ (correct); displace of live keeps count; age/linger retire --. dispose zeroes.
