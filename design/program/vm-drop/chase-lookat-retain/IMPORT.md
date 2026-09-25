# IMPORT — chase-lookat-retain

## What it is

Chase `follow()` retains the Three lookAt base quaternion when eye+target are
bit-identical after settle. Roll/shake still post-multiply each frame. Snap and
photo paths invalidate the cache. Soft-GPU fps not claimed.

## How to apply

`camera.js` is CRLF on master; use `--ignore-space-change` if needed:

```bash
git fetch origin
git checkout -B import/chase-lookat-retain origin/master
git apply --ignore-space-change design/program/vm-drop/chase-lookat-retain/patches/*.patch
git add -A && git commit -m "perf(render): retain settled chase lookAt base quat (~2.1×)"
node --test \
  test/chase-lookat-retain.test.mjs \
  test/composition-framing-trust.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-neutral-pair.test.mjs \
  test/pic-07-wreck-camera-clearance.test.mjs
```

## Picture

Untouched. Settled eye+target restores the same base quat Three lookAt would
write; moving chase still calls lookAt. Soft-GPU fps not claimed.

## Apply order

After `composition-framing-trust` (#71) and clearance (#63+#65). Stacks under
prepareFrame / camera.follow lookAt residual.
