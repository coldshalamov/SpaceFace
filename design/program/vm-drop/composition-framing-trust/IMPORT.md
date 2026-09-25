# IMPORT — composition-framing-trust

## What it is

Live chase sticky carries `resolveChaseComposition.hasActiveAttacker` so
`playerHasActiveAttackerFraming` skips a second shipLike walk on the quiet
FOLLOW path. Pure callers without `sticky.hadActiveAttacker` keep the
frame-instant scan.

## How to apply

`camera.js` is CRLF on master; use `--ignore-space-change` if needed:

```bash
git fetch origin
git checkout -B import/composition-framing-trust origin/master
git apply --ignore-space-change design/program/vm-drop/composition-framing-trust/patches/*.patch
git add -A && git commit -m "perf(render): trust composition attacker bit for framing (~11.7×)"
node --test \
  test/composition-framing-trust.test.mjs \
  test/dense-scene-camera-legibility.test.mjs \
  test/camera-focus-separation.test.mjs \
  test/camera-director-governor.test.mjs \
  test/camera-neutral-pair.test.mjs
```

## Picture

Untouched. One-frame lag on lookahead attenuation vs prior-frame composition
bit (sticky hold / flyby still frame-instant). Soft-GPU fps not claimed.

## Apply order

After `composition-threat-prefilter` (#47). Stacks under prepareFrame /
camera.follow residual after #13+#44+#46+#47+#51–#58+#63+#65+#68.
