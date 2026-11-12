# DONE — presentation-query-pose-dirty-retain

## Summary

Quiet parked/yaw flight still paid full `presentationQueries.query` spatial
collect/sort/exactVisible every frame because player (and nearby) TRANSFORM
dirties kept `dirtyCount > 0`, so #74 zero-dirty retain never hit. Pose-dirty
retain admits a short path when the retain key matches and every dirty slot is
TRANSFORM-only and already in the prior visible set: re-exactVisible those
slots, hide any that left the cull, skip the spatial walk. Newcomers and
non-TRANSFORM dirties fail open. Soft-GPU fps not claimed. Picture contract ON
/ unchanged.

Different angle from held applySnapshotPose (~0.85×) and from #74/#77 zero-dirty
+ pos-quantize (those still require dirtyCount===0).

## Before / after

### Offline microbench (primary — portable CPU)

180 bound roots, parked origin (retain key stable), player yaw + NPC micro-drift
TRANSFORM dirty every query × 12k. Before = pose-dirty retain OFF; after = ON.
Isolated Node child processes per package floor run.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-180ents parked poseDirty (5×11-pair floors) | **~5.58–6.03×** | **≥4.74×** |
| primary in-process cite | ~5.49× | ≥4.43× |

Package floor capture (5×11-pair isolated @ 12k): medians 5.64 / 5.79 / 5.70 /
5.58 / 6.03; package floor minSpeedup **≥4.74×** (clears ≥1.5× bar). Dirty-wake
proved: yaw retain → pose leave hides → re-enter admits (`dirtyWake.ok: true`).
Cruise informational ~0.98× (origin cell changes — no regression claim).
Focused suites **31/31**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): syncEntityViews → presentationQueries.query residual after #77.

### Focused tests

`node --test test/presentation-query-pose-dirty-retain.test.mjs test/presentation-query-zero-dirty-retain.test.mjs test/presentation-world.test.mjs test/presentation-world-unchanged-refresh-skip.test.mjs test/presentation-world-origin-cell-corruption.test.mjs test/entity-view-sync-band.test.mjs test/snapshot-fence-dirty-slot-list.test.mjs`
→ **31/31** pass.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `89579be51e54aa29cee63314b376e9f226cd7b59`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323` through #141 tip `c2a9bf173`
