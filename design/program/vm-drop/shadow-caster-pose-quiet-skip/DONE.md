# DONE — shadow-caster-pose-quiet-skip

## Summary

Quiet `prepareFrame` → `syncEntityViews` → `noteRealtimeShadowCasterPose`
residual after #80: parked cast-band roots re-entered the sub-texel pose
compare every closure tick and returned false. A prior in-function
bit-identical early-out held at ~0.87×. Production now **skips the call** at
the syncEntityViews site when root TRS was not applied, visibility did not
change, cast-band policy did not refresh, and a pose is already recorded.
First enter / pose apply / visibility / policy refresh still note.
Bench-only `setShadowCasterPoseQuietSkipForBench(false)` restores always-note.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = quiet-skip off (always note*); after =
quiet-skip on (call-site gate). 80 cast-band roots × 40k frames; unchanged TRS.

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-80roots-parked (primary, 11 isolated pairs) | **~3.63×** | **≥2.49×** |

Oracle: afterNotes 0 / beforeNotes 3.2M (80 × 40k). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `noteRealtimeShadowCasterPose` under syncEntityViews / prepareFrame
residual after #80. Soft-GPU fps not claimed.

### Focused tests

shadow-caster-policy (+ new quiet-skip cases) + renderer-shadow-frame +
shadow-present-cadence + contact-shadow-dirty-ranges + shadow-receiver-tally +
shadow-depth-admission + entity-view-sync-band + render-entity-frame →
**35+8 focused shadow/entity suites pass** (shadow suites 35/35; entity-view 8/8).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-shadow-caster-pose-quiet-skip.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/shadow-caster-pose-quiet-skip-microbench.json`
- Tests: `artifacts/focused-tests-shadow-caster-pose-quiet-skip.log`

## Apply order

After `asteroid-instance-camera-quantize` (#80).
Stacks under prepareFrame / syncEntityViews / noteRealtimeShadowCasterPose residual.

## Risks

- One-frame shadow dirty lag if micromotion writes root TRS after the note site
  without a presentation dirty bit (today micromotion writes hull-local; root
  pose stays fence-owned).
- Bench toggle off restores always-note for A/B; production default is skip on.
