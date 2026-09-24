# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`f4150f648`** (fetched; moved from `37f50a70d`).
Refreshed scratch `vm-work/hillclimb-20260924h` (rebase of prior stack + #40).
Measured from stacked tip; new patches also apply on bare master (far-query has
after-#1 rebase patch).

Quiet stacked 45s profile (prior): idle **61.4%**; long tasks **15**. Soft-GPU fps ignored.

**Shipped this pass:**
- **#41 `far-query-row-scan`** — portable wide-disc query **~11.0×**; far suites pass.
- **#42 `hud-objective-plate-cache`** — settled-edge layout reads **~45×** fewer; HUD/orrery pass.

**Holds / misses:** physics S1-idle sleep, spatial-hash@600, visit-loop cadence,
registry.step residual after #39, classifyWorld residual after #37+#38,
prepareFrame/syncEntityViews leftovers, syncCombatantBounds (prior miss),
propulsion, soft-GPU draw-batch. 11 rocks pinned.

## Next poles

1. registry.step residual after #39 (~100 ms self).
2. classifyWorld residual after #37+#38 (~61–98 ms self).
3. prepareFrame / syncEntityViews leftovers.
4. Physics sleep + spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
