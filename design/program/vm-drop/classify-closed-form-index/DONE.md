# DONE — classify-closed-form-index

## Summary

Incremental `selectClassifyEntities` catch-up for hash-invisible
`physicsBody: false` movers now walks `entityIndex.closedFormMovers`
(O(opt-outs)) instead of the full live list. Overturns the prior inline
filter miss (~1.05–1.3×) with a fair three-way harness.

## Before / after

### Portable microbench (primary KPI)

8000 entities / 24 closed-form / 4000 iters; same hit count (12) across modes:

| mode | wall ms | vs full |
|---|---:|---:|
| full-list (master residual) | 637 | — |
| filter `physicsBody===false` (prior weak) | 609 | **~1.05×** |
| **index `closedFormMovers`** | **4.7** | **~135×** |

Worst-call vs full ~1.4× (noisy at µs); aggregate is the shipping KPI.
Soft-GPU fps not claimed.

### Focused tests

`test/activity-runtime.test.mjs` → **21/21** (includes indexed-lane catch-up).
Bomb choreography + entity-lifecycle index → **23/23**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-index-closedFormMovers-for-classify-ca.patch`
- Scratch: `vm-work/classify-closed-form-index` @ `c981d5cde`
- Microbench: `artifacts/classify-closed-form-index-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against vm-drop / master tip `568d1358e` / `81f2cac48`

## Apply order

Independent. Stacks with classify-pinfacts-cache (pinFacts early-return) —
prefer this package for the catch-up walk; pinfacts still owns rebuild cache.
Supersedes `classify-closed-form-scan` for the walk shape.

## Risks

- Closed-form movers must stamp `physicsBody: false` at spawn (travel-lanes,
  bombs, snares, weapons already do). Flipping the stamp after index append
  without re-index will miss catch-up until the next full reconcile.
- Stub entity indexes with `ready: true` but no `closedFormMovers` array fall
  back to the filtered full-list walk (correctness preserved).
