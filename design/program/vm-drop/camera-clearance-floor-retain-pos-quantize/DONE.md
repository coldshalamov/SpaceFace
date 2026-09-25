# DONE — camera-clearance-floor-retain-pos-quantize

## Summary

Quiet `prepareFrame` → `camera.follow` → `cameraClearanceFloorAt` residual after #73:
floor retain required bit-identical cam X/Y/Z, so quiet chase drift (eye creep ≪ glass)
missed retain every frame and re-ran the structural walk + box-cache hits. Production
now quantizes the retain KEY (cam X/Y/Z) to the same **0.25 WU** cell as authored-instance
camera cull (#53) and presentation-query retain (#77). Exact floats still drive the AABB
walk when the cell changes. Margin is 16 WU. Bench-only
`setCameraClearanceFloorRetainPosQuantizeForBench(false)` restores bit-identical keys.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = retain on, quantize off (drift misses);
after = retain on, quantize on (drift hits within cell). 8 stations + 40 never-roof
field rocks; 400k calls; in-cell drift (`% 0.12`).

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-chase-drift-off-roof (primary) | **~2.07×** | **≥1.66×** |

Primary: **~2.07×** median (11 isolated pairs; floor minSpeedup ≥1.66×). Soft-GPU fps
not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `cameraClearanceBoxForMesh` / `follow` under prepareFrame residual
after #63+#65+#73. Moving clearance without quantize was a prior hold (~0.85×);
this package supersedes that miss the same way #77 superseded moving query retain.

### Focused tests

camera-clearance-floor-retain (+ new quantize cases) + pic-07-wreck-camera-clearance +
chase-lookat-retain + composition-framing-trust + dense-scene-camera-legibility +
camera-focus-separation + camera-director-governor + camera-neutral-pair → **82/82** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-camera-clearance-floor-retain-pos-quantize.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/camera-clearance-floor-retain-pos-quantize-microbench.json`
- Tests: `artifacts/focused-tests-camera-clearance-floor-retain-pos-quantize.log`

## Apply order

After `presentation-query-retain-pos-quantize` (#77) / after `camera-clearance-floor-retain` (#73).
Stacks under prepareFrame / camera.follow residual after #63+#65+#72+#73.

## Risks

- Retain key quantization can delay roof detect / release by up to one 0.25 WU cell
  at an AABB edge during continuous chase — same order as #53/#77; margin is 16 WU.
- Asteroid/wreck structural still disables retain (unchanged from #73).
- Under-roof stamp-check path unchanged (prior ~1.33× hold — not retried).
- Bench toggle off restores bit-identical keys for A/B; production default is on.
