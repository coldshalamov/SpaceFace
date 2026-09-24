# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`a4bb310e2`** (fetched; moved from `3b62f00e9`).
Rebased scratch `vm-work/hillclimb-20260924h` onto new master; measured from stacked
tip including #40–#44.

Quiet stack inherits prior 45s profile shape (idle ~61%; soft-GPU fps ignored).

**Shipped this pass:**
- **#45 `classify-signature-record`** — portable stamp-churn stand-in **~10.86×**; imminent-collision reach early-out supporting ~1.22×; activity suites pass.
- **#46 `snapshot-fence-yaw-quat-cache`** — portable fence pack stand-in **~2.77×**; half-yaw sin/cos cached on rot write.

**Holds / misses:** physics S1-idle sleep, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc (still under bar as a package), prepareFrame camera.follow /
serviceRenderMeshResidency (already poll-cadenced; no new ≥1.5×), syncCombatantBounds,
propulsion, soft-GPU draw-batch. 11 rocks pinned.

## Next poles

1. prepareFrame camera.follow / composition residual after #13+#44+#46.
2. registry.step after #39+#43 (physics / flight / AI holds).
3. classifyWorld visit-body residual after #37+#38+#45 (context assembly).
4. Physics sleep + spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
