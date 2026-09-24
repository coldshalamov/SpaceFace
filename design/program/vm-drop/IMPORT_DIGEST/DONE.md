# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`3b62f00e9`** (fetched; moved from `f4150f648`).
Rebased scratch `vm-work/hillclimb-20260924h` onto new master; measured from stacked
tip including #40–#42.

Quiet stack inherits prior 45s profile shape (idle ~61%; soft-GPU fps ignored).

**Shipped this pass:**
- **#43 `fields-npc-plan-cadence`** — portable NPC plan walk **~2.67×**; quiet idle early-out; fields suites pass.
- **#44 `sync-entity-views-middle-policy-cadence`** — portable middle-band policy stand-in **~2.10×**; LOD/shadow/classifyRender share closure cadence.

**Holds / misses:** physics S1-idle sleep, spatial-hash@600, visit-loop cadence,
classifyWorld residual after #37+#38 (no ≥1.5× this pass), prepareFrame leftovers
beyond #13+#44, syncCombatantBounds (prior miss), propulsion, soft-GPU draw-batch.
11 rocks pinned.

## Next poles

1. classifyWorld residual after #37+#38 (~61 ms self).
2. prepareFrame leftovers after #13+#44 (serviceRenderMeshResidency / camera).
3. registry.step after #39+#43 (physics / flight / AI holds).
4. Physics sleep + spatial-hash@600 holds.
5. Soft-GPU fps is not a KPI.
