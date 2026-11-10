# DONE — presentation-query-zero-dirty-retain

## Summary

Quiet `prepareFrame` → `syncEntityViews` → `presentationQueries.query` residual
after #15+#44+#57+#68+#73: settled zero-dirty identical cull still walked the
spatial grid, sorted candidates, ran exactVisible, and diffed hidden every
frame. Production now retains the prior visible set when dirtyCount is 0,
layout/maxRadius/boundCount match, and cull rect + origin + playerId are
bit-identical. Bench-only `setPresentationQueryZeroDirtyRetainForBench(false)`
restores always-walk. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

180 bound roots (12 ships + field rocks), 20k identical cull queries.
Isolated Node child processes. Before = retain off; after = retain on.

| | Before | After | |
|---|---:|---:|---|
| settled wall (median) | ~929 ms | ~135 ms | **~6.91×** |

Floor minSpeedup **≥5.86×** across seven isolated pairs (settled zero-dirty).
Visible/candidate parity match (98 / 143). Moving-cull informational ~0.99×
(bounds change every call — retain rarely hits). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; `syncEntityViews` / prepareFrame residual after #73.

### Focused tests

`presentation-query-zero-dirty-retain` + `presentation-world` +
`presentation-world-origin-cell-corruption` → **13/13** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-retain-zero-dirty-presentation-query.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/presentation-query-zero-dirty-retain-microbench.json`
- Tests: `artifacts/focused-tests-presentation-query-zero-dirty-retain.log`

## Apply order

After `camera-clearance-floor-retain` (#73). Stacks under prepareFrame /
syncEntityViews query residual after #15+#44+#57+#68+#73.

## Risks

- Retain keys on exact float identity of cull/origin; continuous camera motion
  still walks (intentional).
- Pose/layout/maxRadius/boundCount churn forces a full walk.
