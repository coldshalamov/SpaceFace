# DONE — authored-instance-camera-quantize

## Summary

Authored instance pool sync no longer marks `cameraDirty` on every chase-follow
micro-move. `captureCullCameraState` quantizes world translation to **0.25 WU**
and basis/projection elements to **1e-3**, so quiet damping reuses the stable
owner path instead of forcing every active owner through `syncOwnerSlots`.

## Before / after

### Offline microbench (primary — portable CPU)

Real `syncAuthoredInstancePools` (allocateInstance harness); quiet parked owners;
camera jitter models soft follow damping.

| scenario | Before (exact dirty) | After (quantize) | speedup |
|---|---:|---:|---:|
| quiet-80owners-0.05WU | 344 ms | 73 ms | **~4.72×** |
| quiet-120owners-0.05WU | 202 ms | 87 ms | **~2.32×** |
| quiet-120owners-0.02WU | 213 ms | 61 ms | **~3.50×** |
| quiet-200owners-0.05WU | 264 ms | 113 ms | **~2.33×** |

Primary: **~2.32×**. `ownersVisited` 480k → 88k (~5.5× fewer). Oracle: micro
jitter dirtyRate ~0.19; large 2 WU moves stay ~1.0.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924r` —
`prepareFrame` ~76 ms self after #52; prior profile
`settled-45s-stacked-20260924h` showed `_syncAuthoredInstanceSubmission` ~41 ms
inc under prepareFrame.

### Focused tests

`render-entity-frame` + `instance-chunk-submit-policy` + `entity-view-sync-band`
+ `dynamic-buffer-ranges` → **42/42** pass (combined logs).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quantize-authored-instance-camera-cull-d.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/authored-instance-camera-quantize-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Prefer after #52. Stacks under prepareFrame residual after
#13+#44+#46+#47+#51+#52.

## Risks

- Objects near the frustum edge can lag up to one quant step (~0.25 WU) before
  visibility re-evaluates — glass is hundreds of WU; acceptable for instance cull.
- Projection quantize at 1e-3 still dirties on real zoom/FOV changes.
- Bench-only `setAuthoredInstanceCameraCullExactCompare` must stay false in prod.
