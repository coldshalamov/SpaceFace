# DONE — lifetime-sweep-quiet-clocks-skip

## Summary

Quiet Ceres still paid a full `lifetimeSweep` movable clocks walk every step
even when projectile/fx/ordnance/pickup lanes were empty and no shipLike carried
`despawnAt` — that walk only re-checked Infinity-ttl ships whose POSE `preStep`
already published. Quiet short-lived-lane clocks skip gates the walk on those
empty-lane + no-despawnAt conditions; dirty publish and corpse compact still
run. Projectile spawn or shipLike `despawnAt` restores the full path
(dirty-wake proved). Soft-GPU fps not claimed. Picture contract ON / unchanged.

Different angle from held lifetimeSweep pose-rematch (~1.14×), sleeping-clocks
(~1.12×), and compact-skip (~1.45×).

## Before / after

### Offline microbench (primary — portable CPU)

36 NPC + 48 rocks, quiet Infinity-ttl movers, short-lived lanes empty × 80k
iters. Before = quiet clocks skip OFF; after = ON. Isolated Node child
processes per package floor run on master-applied tree (`4b28a8323` + patch).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet lifetimeSweep clocks skip (5×11-pair floors) | **~1.98–2.06×** | **≥1.65×** |
| primary in-process cite | ~2.05× | ≥1.80× |

Package floor capture (5×11-pair isolated @ 80k): medians 2.055 / 2.017 / 1.987 /
2.040 / 1.977; package floorMedian **1.977×**, floorMin **1.65×** (clears ≥1.5×
bar). Dirty-wake proved: projectile TTL expires + shipLike despawnAt expires
(`dirtyWake.ok: true`). Focused suites **7/7**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step → lifetimeSweep residual after #88+#140.

### Focused tests

`node --test test/lifetime-sweep-quiet-clocks-skip.test.mjs test/core-player-lifetime-sweep.test.mjs`
→ **7/7** pass (verified after clean `git am` on `origin/master` @ `4b28a8323`).

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `0e054955874a6ea4cae0052f290691872b105f67`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Clean master patch tip (am verify): `83b00f07e` on `4b28a8323`
- Restacked onto `origin/master` @ `4b28a8323` through #142 tip `89579be51`
