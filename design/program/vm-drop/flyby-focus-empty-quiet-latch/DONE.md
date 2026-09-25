# DONE — flyby-focus-empty-quiet-latch

## Summary

Quiet flight still paid `flybyFocus.update`'s full shipLike walk
(`pickFlybyTarget` kinematics) every tick past cooldown while no closing
hostile/training pass remained. Quiet latch short-circuits the census when
empty; wakes on membership, hostile spawn/tag (`noteFlybyWake`), or 0.5 s
rescan. Soft-GPU fps not claimed. Picture contract ON / unchanged (no lease
start when quiet).

Prior pick-only probe deferred as thin abs (~0.55 µs); full update path abs
~6.6–6.8 µs/call clears the flybyFocus / bountyHunt thin-abs band. Fresh
near-clock residual outside held pirateParley #151 / pirateDisengage #150 /
bounty #149 / salvage #148 / sanctuary #147 / cones #145 / catch-nets #146
clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `flybyFocus.update` × 60k; 49 ships (player + 48 far neutrals); no
closing hostiles. Before = latch OFF; after = latch ON. Isolated Node child
processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet flybyFocus shipLike census (5×11-pair floors) | **~17.0–17.8×** | **≥14.44×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~17.43 / 17.57 /
17.44 / 16.96 / 17.80; mins across those runs ≥14.44×. Floor across package
runs **≥14.44×** (clears ≥1.5× bar). Abs before ~6.6–6.8 µs/call. Dirty-wake
proved: spawn closing hostile → latch clears → lease starts
(`dirtyWakeOk: true`). Focused latch + prior suites **65/65**. Soft-GPU fps
not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step / near-clock residual after …+#151; prefer NEW
angles outside held clusters. This pass claimed flybyFocus full-update path
(prior pick-only deferral superseded by measured abs).

### Focused tests

`node --test test/flyby-focus-empty-quiet-latch.test.mjs test/flyby-focus.test.mjs test/pirate-parley-empty-quiet-latch.test.mjs test/pirate-disengage-empty-quiet-latch.test.mjs test/bounty-hunt-empty-quiet-latch.test.mjs test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **65/65** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`3f7c9bb28`; focused latch + flyby-focus **4/4**.

## Scratch

- Branch: `vm-work/hillclimb-20260924n`
- Tip: `5ac0d6bc58145b861e08366e751fc4587aa25d93`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `3f7c9bb28f5a638001b51a446e052126f1d51aa1`
