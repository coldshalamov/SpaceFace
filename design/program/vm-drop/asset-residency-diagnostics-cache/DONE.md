# DONE — asset-residency-diagnostics-cache

## Summary

Quiet asset-residency canonical diagnostics are cached until the registry
mutates. Settled `reconcileMeshResidency` polls republish the same object
instead of rebuilding frozen sorted asset rows every ~250 ms.

## Before / after

### Offline microbench (primary — portable CPU)

4000 quiet `canonicalDiagnostics` calls after a seeded registry (no retain/release).
Before = `diagnostics({ canonical: true })` rebuild every call;
After = cached `canonicalDiagnostics()`.

| scenario | Before | After | speedup |
|---|---:|---:|---:|
| quiet-40assets | 159 ms | 0.21 ms | **~768×** |
| quiet-80assets | 211 ms | 0.27 ms | **~794×** |
| quiet-160assets | 237 ms | 0.01 ms | **~30100×** |

Oracle: quiet republish same object reference; retain/release/cacheSweep invalidate.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924h` —
`prepareFrame` → `serviceRenderMeshResidency` → `reconcileMeshResidency` →
`canonicalDiagnostics` (~24 ms in window).

### Focused tests

`asset-residency-diagnostics-cache` + accounting + detached-owners +
render-residency-poll → **pass**. Refcounts unit (playwright skipped) → **pass**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-cache-quiet-asset-residency-canonical-dia.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/asset-residency-diagnostics-cache-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Prefer after #51. Stacks under prepareFrame residency/spaceBg
residual after #13+#44+#46+#47+#51.

## Risks

- Cache invalidates on every `emit` and on `cacheSweepCount++` (even empty sweeps)
  on master-lineage; vm-drop live adapt invalidates on `emit` (no cacheSweepCount yet).
- Non-canonical `diagnostics()` (with events/owners) is uncached by design.
- Consumers that mutate the returned object would corrupt the cache; the
  snapshot is `Object.freeze`d end-to-end as before.
