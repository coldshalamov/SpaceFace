# IMPORT — shadow-caster-pose-quiet-skip

## What it is

Quiet `prepareFrame` → `syncEntityViews` → `noteRealtimeShadowCasterPose` residual
after #80: parked cast-band roots re-entered the sub-texel pose compare every
closure tick and returned false. An in-function bit-identical early-out was a
prior hold (~0.87×). Production now **skips the call** when root TRS was not
applied, visibility did not change, and cast-band policy did not refresh — and
a pose is already recorded. First enter / pose apply / visibility / policy
refresh still note. Bench-only `setShadowCasterPoseQuietSkipForBench(false)`
restores always-note. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/shadow-caster-pose-quiet-skip origin/master
# Stack through #80 first if not already imported (see IMPORT_DIGEST).
git apply --ignore-space-change design/program/vm-drop/shadow-caster-pose-quiet-skip/patches/*.patch
git add -A && git commit -m "perf(render): quiet-skip unchanged shadow caster pose notes (~3.6×)"
node --test \
  test/shadow-caster-policy.test.mjs \
  test/renderer-shadow-frame.test.mjs \
  test/shadow-present-cadence.test.mjs \
  test/contact-shadow-dirty-ranges.test.mjs \
  test/shadow-receiver-tally.test.mjs \
  test/shadow-depth-admission.test.mjs \
  test/entity-view-sync-band.test.mjs \
  test/render-entity-frame.test.mjs
```

## Picture

Untouched: first cast-band enter still records a pose; pose apply, visibility
change, and policy refresh still note and can dirty the shadow map. Quiet
parked roots with an unchanged recorded pose skip the sub-texel compare.
Soft-GPU fps not claimed.

## Apply order

After `asteroid-instance-camera-quantize` (#80).
Stacks under prepareFrame / syncEntityViews / noteRealtimeShadowCasterPose residual.
