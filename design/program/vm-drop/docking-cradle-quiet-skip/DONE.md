# DONE — docking-cradle-quiet-skip

## Summary

Quiet settled flight still paid `physicsRuntime.collisionProxies` scan +
`updateDockingCradle` + `writeDockingCradleGeometry` + a11y resolve every
tick after the magnetic cradle hologram had faded out (`visible01 ≤ 0.004`,
mesh already hidden). Production now latches after the first fully-faded
idle update and skips until a cheap corridor phase/berth maybe-awake fires.
Fade-out while leaving a bay still runs until the envelope hits the floor
(picture unchanged). Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

12 collisionProxies × 200k quiet cradle ticks; before = proxy scan + cradle
update + geometry early-out + a11y every tick; after = latch skip while
maybe-awake clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-docking-cradle-idle-latch (primary, 11 pairs) | **~2.16×** | **≥1.76×** |

Package floor capture (3×11-pair runs): medians 2.167 / 2.153 / 2.167;
mins 1.963 / 1.758 / 1.963. Floor across package runs **≥1.758×** (clears
≥1.5× bar). Dirty-wake proof: latch quiet → approach+berth → maybeAwake
wakes → cradle resumes (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`writeDockingCradleGeometry` / `_updateDockingCradle` under prepareFrame/VFX
on quiet settled flight after #108.

### Focused tests

`node --test test/docking-cradle-quiet-skip.test.mjs test/inactive-vfx-plan.test.mjs test/vfx-save-restore-destroy.test.mjs test/station-docking-corridor.test.mjs` → **31/31** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-docking-cradle-2x.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ see `scratch-sha.txt`
