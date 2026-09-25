# DONE — prune-evidence-cadence

## Summary

Grammar hot-path `pruneEvidence` skips full journal Map walks for 16 ticks
between prunes. Root-create and serialize pass `force=true`. Prior same-tick
skip / watermark misses overturned with a fair multi-tick aging harness.

## Before / after

### Portable microbench (primary KPI)

8000 ticks, mixed-age journals (64 roots / 128 contacts / 32 constraints / 80 lives), churn every 40 ticks:

| | Every-tick (`force=true`) | Cadence 16 |
|---|---|---|
| wall ms | 16.43 | 1.50 |
| speedup | — | **~11.0×** |
| worst call ms | 0.299 | 0.041 |
| worst speedup | — | **~7.3×** |

Soft-GPU fps not claimed.

### Focused tests

`prune-evidence-cadence` + `stunt-combo` + `stunt-taxonomy` + `pq-155-03-stunts-pay` → **23/23**.

## Evidence

- Patch: `patches/0001-perf-combat-cadence-pruneEvidence-on-grammar-hot-pat.patch`
- Scratch: `vm-work/hillclimb-20260924c` @ `bf11673f1`
- Microbench: `artifacts/prune-evidence-cadence-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against master `568d1358e`

## Apply order

Independent. Stacks with projectile-surface-distance-first.

## Risks

- Deferred prune can retain expired rows up to 16 ticks (≪ contact TTL 180 / root TTL 480)
- Episode capacity still eagers prune before the size check on new roots
