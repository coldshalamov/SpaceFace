# IMPORT — decode-runway-top2-select

## What it is

`kickDecodeRunwayAssets` no longer `slice().sort()`s the full presentation list by
`entityTimeToGlassSeconds` on every residency collect. It selects the two earliest
eligible ship/station starts (wave-planned first, then time-to-glass) in one O(n)
pass. Also: hold-exempt approach timing type-gates dressing/props before tGlass;
`reconcileMeshResidency` caches time-to-glass across classify/sort/rehoist.

## How to apply

```bash
git fetch origin
git checkout -B import/decode-runway-top2-select origin/master
git am design/program/vm-drop/decode-runway-top2-select/patches/*.patch
node --test test/decode-runway-residency.test.mjs \
  test/first-flight-hold-exempt.test.mjs \
  test/wave-hull-decode-runway.test.mjs \
  test/render-residency-poll.test.mjs \
  test/presentation-residency.test.mjs \
  test/first-flight-gpu-hold.test.mjs
```

Prefer after #53. Independent of classify/registry poles.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under prepareFrame / entityTimeToGlassSeconds residual after
#13+#44+#46+#47+#51+#52+#53.
