# IMPORT — trail-history-pool

## What it is

Pool radar contact trail `{x,z}` points: recycle the shifted tip at `TRAIL_MAX`,
grow from a retained free list, and return points on prune / sector enter / destroy.

## How to apply

```bash
git fetch origin
git checkout -B import/trail-history-pool origin/master
git am design/program/vm-drop/trail-history-pool/patches/*.patch
node --test test/tactical-map-second-generation.test.mjs test/fix-f56-radar-range-ring.test.mjs
```

## Picture

Untouched. Same FIFO trail distance gate and max length.

## Apply order

Independent. Clean on bare `origin/master`. Compatible with `radar-project-scratch`
and `radar-contact-color-defer`.
