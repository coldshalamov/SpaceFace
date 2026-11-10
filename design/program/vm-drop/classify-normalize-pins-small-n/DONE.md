# DONE — classify-normalize-pins-small-n

## Summary

Quiet `classifyWorld` spends heavily in `resolvePins` → `normalizePinReasons`.
On Ceres-shaped traffic most lists are empty or one/two pins, yet every call
paid `Set.clear` + scan + `sort`. Production now returns early for `n <= 2`
(preserving membership + lexicographic order) and keeps Set+sort for `n >= 3`.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

200-entity quiet mix (≈89% empty / 9% single / 1% pair / 1% multi) × 50k
visits × 11 in-process runs, five isolated before/after child pairs.

| | Before | After | |
|---|---:|---:|---|
| wall (median) | 870.5 ms | 453.4 ms | **~1.92×** |

Floor minSpeedup **1.91×** across five isolated pairs; admit parity on fixed
corpus. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): `normalizePinReasons` self under `classifyWorld` / `resolvePins`
(top classify residual after #62).

### Focused tests

activity-classification + activity-runtime → **35/35** pass on scratch tip
(with new small-n cases); **32/32** on vm-drop tree after patch apply (pre-existing
suite, no new test file in patch).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-activity-small-n-fast-path-for-normalizePinReaso.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/classify-normalize-pins-small-n-microbench.json`
- Tests: `artifacts/focused-tests-classify-normalize-pins-small-n.log`

## Apply order

Independent. Stacks under classifyWorld after #60+#62. Prefer after
`classify-physics-partition-cache`.

## Risks

- Callers that relied on `normalizePinReasons` mutating a shared `seen` Set
  on the empty-list path no longer touch `seen` for n<=2 (scratch.out still
  cleared). No production caller reads `seen` after normalize.
- n==2 invalid+valid mixes drop invalids without allocating `seen` — same
  observable out contents as before.
