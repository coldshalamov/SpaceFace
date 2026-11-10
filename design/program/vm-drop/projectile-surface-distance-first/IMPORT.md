# IMPORT — projectile-surface-distance-first

## What it is

In `sampleProjectileEvidence`, range-gate entities at 600 WU (squared) **before**
`materialSurface` / `surfaceResponseFor` when filling `surfaceHistory` (max 8).

## How to apply

```bash
git fetch origin
git checkout -B import/projectile-surface-distance-first origin/master
git am design/program/vm-drop/projectile-surface-distance-first/patches/*.patch
node --test test/projectile-surface-distance-first.test.mjs test/stunt-combo.test.mjs test/stunt-taxonomy.test.mjs test/pq-155-03-stunts-pay.test.mjs
```

Clean on bare master **`568d1358e`**.

## Evidence

- Portable 2500-entity × 4000-iter microbench: **~1.87×**
- Focused tests: **22/22**
- Soft-GPU fps not claimed

## What this does not wire

- No spatial-hash path (warm hash at 600 WU was slower than Map walk)
- Does not merge to master (importer decides)
