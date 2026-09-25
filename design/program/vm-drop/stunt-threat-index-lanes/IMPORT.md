# IMPORT — stunt-threat-index-lanes

## What it is

Stunt flight threat scan walks entity-index ship/drone/projectile lanes instead
of the full live entity map (quiet Ceres rocks skipped). Portable microbench
**~16.4×**.

## How to apply

```bash
git fetch origin
git checkout -B import/stunt-threat-index-lanes origin/master
git am design/program/vm-drop/stunt-threat-index-lanes/patches/*.patch
node --test test/stunt-combo.test.mjs test/stunt-taxonomy.test.mjs \
  test/pq-155-03-stunts-pay.test.mjs
```

## Apply order

Independent. Complements `stunt-flight-range-prefilter` (range gate retained).

## Picture

Untouched.
