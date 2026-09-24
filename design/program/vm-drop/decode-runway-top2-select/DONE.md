# DONE — decode-runway-top2-select

## Summary

`kickDecodeRunwayAssets` no longer marks every presentation entity through a
full-list `slice().sort()` keyed on `entityTimeToGlassSeconds`. Production selects
the **top-2** eligible ship/station starts (wave-planned first, then earliest
time-to-glass) in one pass. Bench-only `setDecodeRunwaySelectStrategyForBench('sort')`
restores the legacy comparator for A/B.

Also in this package:
- Hold-exempt approach timing type-gates dressing/props before tGlass (hulls +
  ledger rocks only).
- `reconcileMeshResidency` caches time-to-glass across classify / sort / rehoist.

## Before / after

### Offline microbench (primary — portable CPU)

Synthetic presentation-shaped list (rocks + inbound ships); compares legacy
full-list sort vs top-2 select.

| scenario | Before (sort) | After (top2) | speedup |
|---|---:|---:|---:|
| 200 ent / 16 ships ×400 | 30.2 ms | 9.5 ms | **~3.18×** |
| 400 ent / 24 ships ×300 | 32.9 ms | 8.0 ms | **~4.09×** |
| 800 ent / 32 ships ×200 | 35.6 ms | 1.8 ms | **~19.6×** |
| 400 ent / 48 ships ×300 | 26.8 ms | 2.9 ms | **~9.20×** |

Primary: **~4.09×**. Glass calls/iter 2174 → 24 (~90× fewer). Oracle: sort and
top2 pick identical ids across 40 seeded lists; both return limit=2.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924r` —
`entityTimeToGlassSeconds` ~70 ms self under `kickDecodeRunwayAssets` →
`decodeSeconds` (full-list sort).

### Focused tests

`decode-runway-residency` + `first-flight-hold-exempt` + `wave-hull-decode-runway`
+ `render-residency-poll` + `presentation-residency` + `first-flight-gpu-hold`
→ **42/42** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-decode-runway-top-2-select.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/decode-runway-top2-select-microbench.json`
- Tests: `artifacts/focused-tests-decode-runway-top2-select.log`

## Apply order

Independent. Prefer after #53. Stacks under prepareFrame /
`entityTimeToGlassSeconds` residual after #13+#44+#46+#47+#51+#52+#53.

## Risks

- Top-2 selection is order-equivalent to sort-then-take for the same eligibility
  predicates (oracle-checked). Ties on equal (wave, t) keep first-seen order;
  legacy sort was unstable on equal keys too.
- Hold-exempt type gate defers dressing/props that somehow passed approach-time
  without being on readable glass — intended; those were never the hold-exempt
  contract.
- Bench-only `setDecodeRunwaySelectStrategyForBench('sort')` must stay off in prod.
