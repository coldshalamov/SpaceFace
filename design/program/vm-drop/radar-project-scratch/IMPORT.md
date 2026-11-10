# IMPORT — radar-project-scratch

## What it is

1. Optional `out` param on `projectRadarPoint` (scratch write; no `Object.freeze` alloc).
2. Pooled hostile/infrastructure mark rows storing `x/y/angle/offRange` copies.
3. Skip unchanged radar `aria-label` writes.

Independent of `radar-contact-color-defer` (still valid on bare master; still valid after that package).

## How to apply

```bash
git fetch origin
git checkout -B import/radar-project-scratch origin/master
git am design/program/vm-drop/radar-project-scratch/patches/*.patch
node --test test/tactical-map-second-generation.test.mjs test/fix-f56-radar-range-ring.test.mjs
```

## Picture

Untouched. Projection math identical; marks carry copied coordinates.

## Apply order

Independent. Clean on bare `origin/master`. Compatible with `radar-contact-color-defer`.
