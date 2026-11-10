# DONE — presentation-query-retain-pos-quantize

## Summary

Quiet `prepareFrame` → `syncEntityViews` → `presentationQueries.query` residual after
#74: zero-dirty retain required bit-identical cull rect + origin, so quiet chase
drift (focus/origin creep ≪ glass) missed retain every frame and re-ran spatial
collect/sort/exactVisible. Production now quantizes the retain KEY (bounds/origin)
to the same **0.25 WU** cell as authored-instance camera cull (#53). Exact floats
still drive the full walk when the cell changes. `halfX`/`halfZ` stay exact so zoom
still misses retain. Bench-only
`setPresentationQueryRetainPosQuantizeForBench(false)` restores bit-identical keys.
Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Before = retain on, quantize off (drift misses);
after = retain on, quantize on (drift hits within cell).

| scenario | median | floor minSpeedup |
|---|---:|---:|
| quiet-180ents-chase-drift (primary) | **~3.05×** | **≥2.83×** |

Primary: **~3.05×** median (20k queries × 180 slots; floor minSpeedup ≥2.83×).
Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64 @ `e1b3f26a3`): idle **65.2%**, long
tasks **17**; presentationQueries.query residual after #74 under syncEntityViews.

### Focused tests

presentation-query-zero-dirty-retain (+ new quantize cases) + presentation-world +
presentation-world-unchanged-refresh-skip + presentation-world-origin-cell-corruption +
entity-view-sync-band + snapshot-fence-dirty-slot-list → **26/26** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-presentation-query-retain-pos-quantize.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/presentation-query-retain-pos-quantize-microbench.json`
- Tests: `artifacts/focused-tests-presentation-query-retain-pos-quantize.log`

## Apply order

After `presentation-world-unchanged-refresh-skip` (#76). Stacks under prepareFrame /
syncEntityViews residual after #15+#44+#57+#74+#75+#76.

## Risks

- Retain key quantization can delay visibility transitions by up to one 0.25 WU
  cell at the glass edge during continuous chase — same order as #53 instance cull.
- Zoom / half-extent changes still force a full walk (halfX/halfZ compared exact).
- Dirty presentation world still forces a full walk (dirtyCount gate unchanged).
- Bench toggle off restores bit-identical keys for A/B; production default is on.
