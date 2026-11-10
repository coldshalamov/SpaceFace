# IMPORT — far-query-row-scan

## What it is

`queryFarActors` prefers a linear `table.rows` walk when `cellSpan > rows.length`
(typical decode-runway / enter discs vs ≤128 far rows). Tight discs keep the grid
walk. Portable microbench **~11×**.

## How to apply

On bare master (string grid keys):

```bash
git fetch origin
git checkout -B import/far-query-row-scan origin/master
git am design/program/vm-drop/far-query-row-scan/patches/0001-perf-world-adaptive-row-scan-for-wide-far-actor-disc.patch
node --test test/far-query-row-scan.test.mjs test/far-actors.test.mjs
```

If `far-actor-cell-key` (#1) is already applied, use the rebase patch instead:

```bash
git am design/program/vm-drop/far-query-row-scan/patches/0001-far-query-row-scan-after-cell-key.patch
```

See `REBASE_20260924.md`.

## Apply order

Independent of HUD. Complements #1 far-actor-cell-key (integer keys). Prefer
applying after #1 when stacking; use the after-cell-key patch in that case.

## Picture

Untouched.
