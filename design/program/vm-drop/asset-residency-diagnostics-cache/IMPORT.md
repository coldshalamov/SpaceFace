# IMPORT — asset-residency-diagnostics-cache

## What it is

`canonicalDiagnostics()` caches the frozen summary until residency mutates
(`emit` / `cacheSweepCount`). Quiet `reconcileMeshResidency` polls (~250 ms)
no longer rebuild sorted asset-row tables when nothing changed.
`_publishAssetResidencyDiagnostics` skips reassignment when the object is
unchanged.

## How to apply

```bash
git fetch origin
git checkout -B import/asset-residency-diagnostics-cache origin/master
git am design/program/vm-drop/asset-residency-diagnostics-cache/patches/*.patch
node --test test/asset-residency-diagnostics-cache.test.mjs \
  test/asset-residency-accounting.test.mjs \
  test/asset-residency-detached-owners.test.mjs \
  test/render-residency-poll.test.mjs
```

Prefer after #51. Independent of classify/sync poles.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under prepareFrame residency residual after #13+#44+#46+#47+#51.
