# DONE — classify-signature-prune-membership

## Summary

Quiet incremental `classifyWorld` no longer walks `signaturesById` every tick.
After pinFacts-cache + #37 `closedFormMovers`, that O(live-world) liveness probe
was the remaining portable prune residual inside classify. Gate it on
`entityIndex.version` (sanctioned spawn/despawn already bumps the version). Full
classify still prunes against `currentEntityIds`.

## Before / after

### Portable microbench (primary KPI)

800 signatures × 30k quiet incremental prune iters:

| mode | wall ms | vs every-tick |
|---|---:|---:|
| every-tick walk (master residual) | 198.8 | — |
| **membership-gated quiet** | **1.1** | **~178×** |

Miss path (membership bump) still prunes. Soft-GPU fps not claimed.

### Focused tests

`test/activity-runtime.test.mjs` → **21/21** (includes membership-gate prune).

Pre-existing on bare master: Rapier goo-braking choreography fail — not from this package.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-gate-classify-signature-prune-on-entity.patch`
- Scratch: `vm-work/classify-residual` @ `e7782416b`
- Microbench: `artifacts/classify-signature-prune-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against master tip `37f50a70d` / prior digest cite `568d1358e`

## Apply order

Independent. Prefer after #37 `classify-closed-form-index` so the residual this
cuts is the one left once catch-up is indexed. Safe alone on master with the
inline `physicsBody === false` filter.

## Risks

- Despawn paths that set `alive = false` without going through
  `removeEntityIndex` (no version bump) delay prune until the next sanctioned
  membership change. Production remove goes through the index; the focused test
  covers both the gate hold and the bump prune.
