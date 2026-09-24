# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; moved from `a4bb310e2`).
Rebased scratch `vm-work/hillclimb-20260924h` onto new master; measured from stacked
tip including #40–#46.

Quiet stack inherits prior 45s profile shape (idle ~61%; soft-GPU fps ignored).

**Shipped this pass:**
- **#47 `composition-threat-prefilter`** — portable follow-pair **~2.09–2.33×** quiet; combat ~2.06×; camera suites pass.
- **#48 `classify-rock-body-context`** — portable rock-dominated context fill **~1.55×**; activity suites pass.

**Holds / misses:** physics S1-idle sleep, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc (prior under bar; #48 is a different angle), registry.step
residual (physics/flight/AI holds), serviceRenderMeshResidency, propulsion,
soft-GPU draw-batch. 11 rocks pinned.

## Next poles

1. registry.step after #39+#43 (physics / flight / AI holds).
2. prepareFrame residual after #13+#44+#46+#47 (non-composition leftovers).
3. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
4. Physics sleep + spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
