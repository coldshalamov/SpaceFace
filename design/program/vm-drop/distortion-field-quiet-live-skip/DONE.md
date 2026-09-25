# DONE — distortion-field-quiet-live-skip

## Summary

Quiet distortion residual under prepareFrame / WeaponVfxPresenter after
#95: `distortion.update` always walked CAP (64) slots and set 3-attr
`needsUpdate` every frame when no haze was alive. Mesh was already
count=0/visible=false after the frame that retired the last slot.

uTime still advances on the quiet path so a later spawn resumes with a
current clock. Well sync (`_syncWellDistortion`) keeps `field.live` in
sync because well slots are written outside `spawn()`. One idle publish
still runs when mesh.count>0 so an external clear hides correctly.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet update × 200k × 11 isolated
pairs. Before = capacity walk + publish every tick; after = live===0 early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-distortion-live-zero-update (primary, 11 isolated pairs) | **~6.9×** | **≥5.70×** |

Primary: **~6.9×** median (floor minSpeedup ≥5.70× across rebenches). Soft-GPU
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

- Patch: `patches/0001-perf-render-quiet-skip-DistortionField-live-0-6.5x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/distortion-field-quiet-live-skip-microbench.json`
- Tests: `artifacts/focused-tests-weapon-vfx-quiet-live-skips.log`

## Apply order

Independent of siblings. Stacks under prepareFrame / weapon presenter residual.
Clean on stacked tip through #94. Prefer apply after #95 for digest order.

## Risks

- Relies on `live` staying in sync: coalesce into already-alive slot does not
  ++ (correct); displace of live keeps count; age/linger retire --. dispose zeroes.
