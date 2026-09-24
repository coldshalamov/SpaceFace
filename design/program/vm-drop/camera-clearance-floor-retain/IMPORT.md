# IMPORT — camera-clearance-floor-retain

## What it is

Quiet chase `follow()` retains the last clearance floor when cam X/Y/Z are
bit-identical, structural is station/place-only (or empty), and the last floor
was `-Infinity` (off-roof). Asteroid/wreck structural skips retain; under-roof
retains confirm authored stamps. Soft-GPU fps not claimed.

## How to apply

```bash
git fetch origin
git checkout -B import/camera-clearance-floor-retain origin/master
# Stack clearance + lookAt first if not already imported:
#   camera-clearance-asteroid-span-reject (#63)
#   camera-clearance-never-roof-exclude (#65)
#   chase-lookat-retain (#72)
git apply --ignore-space-change design/program/vm-drop/camera-clearance-floor-retain/patches/*.patch
git add -A && git commit -m "perf(render): retain settled clearance floor off-roof (~2.1×)"
node --test \
  test/camera-clearance-floor-retain.test.mjs \
  test/pic-07-wreck-camera-clearance.test.mjs \
  test/chase-lookat-retain.test.mjs \
  test/composition-framing-trust.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-neutral-pair.test.mjs
```

## Picture

Untouched for quiet off-roof flight (identical cam → identical `-Infinity`).
Under-roof / asteroid / wreck paths still walk. Soft-GPU fps not claimed.

## Apply order

After `chase-lookat-retain` (#72) and clearance (#63+#65). Stacks under
prepareFrame / camera.follow clearance residual.
