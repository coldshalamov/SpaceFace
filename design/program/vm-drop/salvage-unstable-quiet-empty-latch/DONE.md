# DONE — salvage-unstable-quiet-empty-latch

## Summary

Quiet flight still paid `salvageActions.update`'s full `entities.values()`
walk (`isWreck` / `unstableReactor` bag) every tick while inert wrecks or a
fat non-wreck roster existed but no live unstable reactors remained. Quiet
latch short-circuits the census when no live unstable reactor remains; wakes
on membership, reactor arm/annotate (`_armReactor` /
`configureAuthoredWreck`), or 0.5 s rescan. Live census prefers the wrecks
index. Soft-GPU fps not claimed. Picture contract ON / unchanged (no burst
when quiet).

Fresh salvage residual outside held lifetimeSweep / classify / sync /
weapons residual deepen / customs cones #145 / catch-nets #146 / sanctuary
#147 clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `salvageActions.update` × 60k; 49 ships + 80 asteroids + 12 inert
wrecks; no live unstable reactors. Before = latch OFF; after = latch ON.
Isolated Node child processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet salvage walk (5×11-pair floors) | **~4.19–4.64×** | **≥3.09×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~4.34 / 4.43 /
4.21 / 4.19 / 4.64; mins across those runs ≥3.09×. Floor across package
runs **≥3.09×** (clears ≥1.5× bar). Dirty-wake proved: configureAuthoredWreck
with reactorTimerS → latch clears → burst at dueAt (`dirtyWakeOk: true`).
Focused latch + prior suites **52/52**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): salvage residual still paid `entities.values()` after #146/#147
removed catch-nets/sanctuary share from loot/law.

### Focused tests

`node --test test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **52/52** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`813d3160f`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `3464b9fce03447ba9c38a8a2e13f420f227fb1c9`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `813d3160f8d218d97d15b69e52bab36144378d03`
