# DONE — arcade-structural-fx-quiet-live-skip

## Summary

Quiet `ArcadeStructuralFx.update` residual under prepareFrame / VFX after #88:
four StructuralPools (128+48+64+32 = 272 slots) still walked every frame while
`live===0`, only to `continue` on dead slots. `mesh.visible` was already gated
on `live > 0`, so the scan was pure CPU with no picture effect.

Production now:
1. `StructuralPool.update` returns immediately when `live===0`.
2. `ArcadeStructuralFx.update` returns when every pool is idle (avoids four
   call sites on the common quiet path). Busy pools still update; idle sibling
   pools still skip via the pool-level gate.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 272 quiet slots × 100k updates × 11 isolated
pairs. Before = capacity alive-check walk every tick; after = live===0 +
composite idle early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-four-pool-live-zero-update (primary, 11 isolated pairs) | **~17.3×** | **≥14.8×** |

Primary: **~17.3×** median (floor minSpeedup ≥14.8×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`arcadeStructuralFx.update` ~14–18 ms self under prepareFrame/VFX on quiet
settled flight. Polluted 20s cite `settled-20s-stacked-20260924ad` also showed
the owner.

### Focused tests

`vfx-arcade-structural-fx` + `impact-event-grammar` + `vfx-structured-transients`
→ **33/33** pass.

Pre-existing unrelated: `arcade-structural-fx-mount` 6/11 (WebGL/spawn harness
fails on tip without this patch — same baseline). Also noted since #86/#87:
activity-scheduler ambient-hauler regex; pq146-tether; dead-wire
`MINIMAL_ACTION_AUDIO`.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-ArcadeStructuralFx-live0-17x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/arcade-structural-fx-quiet-live-skip-microbench.json`
- Tests: `artifacts/focused-tests-arcade-structural-fx-quiet-live-skip.log`

## Apply order

Independent of combat/#88 lanes. Stacks under prepareFrame / VFX residual.
Clean on stacked tip through #88.

## Risks

- Relies on `live` staying accurate (spawn ++, death --, clear = 0). Existing
  pool invariants; no new counter paths.
- If `live` were falsely 0 while slots alive, those slots would freeze until
  next spawn — not observed; spawn always increments live.
