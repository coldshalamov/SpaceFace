# DONE — far-query-row-scan

## Summary

Wide far-actor discs (decode runway / enter) walked more empty grid cells than
live rows (≤ `FAR_ROW_BUDGET`). Adaptive path: when `cellSpan > rows.length`,
scan `table.rows` linearly; otherwise keep the grid walk. Correctness-equal.

## Before / after

### Portable microbench (primary KPI)

96 far rows, radius **3600 WU**, 8000 queries (stacked tip after #1):

| | Grid-only | Adaptive |
|---|---|---|
| wall | **43.62 ms** | **3.95 ms** |
| speedup | — | **~11.0×** |
| hits | 37 | 37 |

Soft-GPU fps not claimed.

### Focused tests

`far-query-row-scan` + `far-actor-cell-key` + `far-actors` + `far-shelf-promotion`
+ `decode-runway-residency` + `pq-033-02-far-row-budget` → **pass** (see artifacts).

## Evidence

- Patches: `patches/0001-perf-world-adaptive-row-scan-for-wide-far-actor-disc.patch`
  (bare master) + `0001-far-query-row-scan-after-cell-key.patch` (after #1)
- Scratch: `vm-work/hillclimb-20260924h` @ `92586e555`
- Microbench: `artifacts/far-query-row-scan-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against stacked tip on master `f4150f648` (+ pending imports including #1/#40)

## Apply order

See IMPORT.md / REBASE_20260924.md.

## Risks

- Grid path retained for tight discs; no behavior change when `cellSpan ≤ rows`.
- Rows with `alive === false` still skipped (same predicate as grid walk).
