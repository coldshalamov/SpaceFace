# IMPORT — authored-instance-camera-quantize

## What it is

`captureCullCameraState` for authored instance pools no longer treats every
chase-follow micro-move as `cameraDirty`. Translation quantizes to 0.25 WU and
basis/projection to 1e-3, so quiet damping reuses the stable owner path
(`matrixReuses` / skip `syncOwnerSlots`). Real pans and zooms still dirty.

## How to apply

```bash
git fetch origin
git checkout -B import/authored-instance-camera-quantize origin/master
git am design/program/vm-drop/authored-instance-camera-quantize/patches/*.patch
node --test test/render-entity-frame.test.mjs \
  test/instance-chunk-submit-policy.test.mjs \
  test/entity-view-sync-band.test.mjs \
  test/dynamic-buffer-ranges.test.mjs
```

Prefer after #52. Independent of classify poles.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under prepareFrame residual after #13+#44+#46+#47+#51+#52.
