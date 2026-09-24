# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` through #49; measured #50 on stack.

Quiet stack inherits prior 45s profile shape (idle ~61%; soft-GPU fps ignored).

**Shipped this pass:**
- **#50 `combat-table-pose-incremental`** — portable quiet `packCombatTable`
  **~4.78×** (pose-only in-place row refresh; membership still full-rebuilds);
  combat+projectiles ~1.72×; pq-204 **24/24**.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins (~1.02×),
selectClassify empty-projectile (~1.11×), prepareFrame non-composition leftovers,
classify non-rock residual, propulsion, soft-GPU draw-batch. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47 (non-composition: pack/residency/spaceBg).
2. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
3. registry.step after #39+#43+#49+#50 (physics / flight / AI holds).
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
