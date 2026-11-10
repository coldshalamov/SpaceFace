# DONE — sync-entity-views-submit-scratch

## Summary

1. **Hidden path:** `shouldSubmitEntityMesh({ hidden: true })` is exactly
   `protectedRoot` after the snapshotMissing gate — apply
   `posed && protectedRoot` and skip the options object entirely.
2. **Visible path:** retain one module-level `_submitEntityMeshOptions` scratch;
   rewrite every field the helper can read each entity (no per-entity literal).

## Before / after

### Offline alloc/CPU microbench (`node --expose-gc`, primary)

800 entities × 600 frames, 40% hidden:

| Mode | Time | Heap delta |
|---|---|---|
| Before (literal both paths) | **14.25 ms** | **+13.7 KB** |
| Hidden short-circuit only | **1.14 ms (~12.5×)** | **~0** |
| Full after (hidden + visible scratch) | **11.47 ms (~1.24×)** | **+11.4 KB** |

Dominant win is the hidden closed form; visible scratch removes remaining
per-visible-entity option literals (GC pressure under soft-GPU flight).

Phase A cite: cpu-profile-flight `syncEntityViews` / alloc-profile GC.

### Focused tests

`test/entity-mesh-visibility.test.mjs` → **11/11** pass (source contract updated).

## Evidence

- Patch: `patches/0001-perf-render-scratch-shouldSubmitEntityMesh-options-h.patch`
- Scratch: `vm-work/sync-entity-views-submit-scratch` @ see `scratch-sha.txt`
- Alloc bench: `artifacts/sync-entity-views-submit-scratch-alloc-bench.json`
- Microbench: `artifacts/sync-entity-views-submit-scratch-microbench.json`
- Tests: `artifacts/sync-entity-views-submit-scratch-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `a57d7036d`

## Apply order

Independent. Complements `sync-entity-views-closure-gate`.

## Risks

- Source contract no longer requires two literal `shouldSubmitEntityMesh({...})`
  call sites; it asserts scratch field writes + hidden closed form instead.
- Hidden path must stay equivalent to `shouldSubmitEntityMesh({ hidden:true })`
  — protected roots still submit when posed; ordinary roots stay hidden.
