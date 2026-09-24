# DONE — IMPORT_DIGEST (report job)

## Summary

Post-import hillclimb on master **`2e7ec656b`** (fetched; unchanged).
Scratch `vm-work/hillclimb-20260924h` refreshed through #48; measured #49 on stack.
vm-drop catch-up: #40 `stunt-threat-index-lanes` source (previously docs-only) landed
with #49.

Quiet stack inherits prior 45s profile shape (idle ~61%; soft-GPU fps ignored).
Profile child: `StuntFlightObserver.update` ~92 hits under `registry.step`.

**Shipped this pass:**
- **#49 `stunt-threat-lock-prefilter`** — portable quiet threat scan **~2.04×**
  (lock-before-hostility + cadence2 when no tracks / empty projectiles); combat
  active-tracks lock-only ~1.63×; stunt suites **20/20**. Also lands #40 source
  catch-up on vm-drop.

**Holds / misses:** physics S1-idle, spatial-hash@600, visit-loop cadence,
stamp-reuse/inert/near-disc, imminent-collision (~1.22×), rock-resolvePins (~1.02×),
selectClassify empty-projectile (~1.11×), prepareFrame non-composition leftovers,
classify non-rock residual, propulsion, soft-GPU draw-batch. 11 rocks pinned.

## Next poles

1. prepareFrame residual after #13+#44+#46+#47 (non-composition leftovers).
2. classifyWorld residual after #37+#38+#45+#48 (non-rock visit / selectClassify).
3. registry.step after #39+#43+#49 (physics / flight / AI holds).
4. syncEntityViews residual after #15+#44.
5. Soft-GPU fps is not a KPI.
