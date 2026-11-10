# DONE — bounty-hunt-empty-quiet-latch

## Summary

Quiet flight still paid `bountyHunt.update`'s full shipLike walk
(`isBountyHunter` / `normalizeHunter` / `tickHunterTrick`) every tick while
no live bounty hunters remained. Quiet latch short-circuits the census when
empty; wakes on membership, hunter spawn/tag, or 0.5 s rescan. Soft-GPU fps
not claimed. Picture contract ON / unchanged (no hunter normalize when quiet).

Fresh law/wanted-adjacent residual outside held lifetimeSweep / classify /
sync / weapons residual deepen / customs cones #145 / catch-nets #146 /
sanctuary #147 / salvage #148 / flybyFocus thin-abs clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `bountyHunt.update` × 60k; 49 ships (player + 48 passive); no bounty
hunters. Before = latch OFF; after = latch ON. Isolated Node child processes
(`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet bountyHunt walk (5×11-pair floors) | **~4.91–5.25×** | **≥4.05×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~5.09 / 5.01 /
5.19 / 5.25 / 4.91; mins across those runs ≥4.05×. Floor across package
runs **≥4.05×** (clears ≥1.5× bar). Dirty-wake proved: spawn hunter via
`makeBountyHunterSpec` → latch clears → `forcePlayerTarget` normalize
(`dirtyWakeOk: true`). Focused latch + prior suites **55/55**. Soft-GPU fps
not claimed.

Abs before ~0.58 µs/call (near flybyFocus deferred band ~0.55 µs) but ratio
+ floor clear the portable bar the same way #148 salvage did (~0.48 µs abs
shipped). Profile cite through #64 did not name bountyHunt self; residual is
the empty hunter census on the combat clock (ranked pole #2 law wanted·ambient).

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#148; law wanted·ambient preferred.

### Focused tests

`node --test test/bounty-hunt-empty-quiet-latch.test.mjs test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **55/55** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`93dc4db5e`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `8d1e8ae957dc3c31fd38d71f75a4d3e84ec16a6b`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `93dc4db5e7d337311cf7ccdf5380da7ef9f064dc`
