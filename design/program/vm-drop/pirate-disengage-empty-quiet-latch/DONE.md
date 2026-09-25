# DONE — pirate-disengage-empty-quiet-latch

## Summary

Quiet flight still paid `pirateDisengage.update`'s dual shipLike walk
(`lawfulPatrols` / `combatantSquads` / `isActiveCombatant`) every tick while
no active pirate/hostile combatants remained. Quiet latch short-circuits
both censuses when empty; wakes on membership, combatant spawn/tag, or
0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON / unchanged
(no morale decision when quiet).

Fresh combat residual outside held lifetimeSweep / classify / sync /
weapons residual deepen / customs cones #145 / catch-nets #146 /
sanctuary #147 / salvage #148 / bountyHunt #149 / flybyFocus thin-abs
clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `pirateDisengage.update` × 60k; 49 ships (player + 48 passive); no
active combatants. Before = latch OFF; after = latch ON. Isolated Node
child processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet pirateDisengage dual census (5×11-pair floors) | **~45.1–46.8×** | **≥36.87×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~45.85 / 45.06 /
46.08 / 46.76 / 45.10; mins across those runs ≥36.87×. Floor across package
runs **≥36.87×** (clears ≥1.5× bar). Dirty-wake proved: spawn pirate via
`role:'pirate'` → latch clears (`dirtyWakeOk: true`). Focused latch + prior
suites **58/58**. Soft-GPU fps not claimed.

Abs before ~4.02 µs/call (well above flybyFocus deferred band ~0.55 µs /
bountyHunt ~0.58 µs). Profile cite through #64 did not name pirateDisengage
self; residual is the empty combatant dual census on the combat clock
(ranked pole #2 combat / registry.step).

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#149; prefer NEW combat /
law angles outside held clusters.

### Focused tests

`node --test test/pirate-disengage-empty-quiet-latch.test.mjs test/bounty-hunt-empty-quiet-latch.test.mjs test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **58/58** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`8dbf201ee`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `259e98de323a84dfa64da32215c140da0f9136db`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `8dbf201ee89f9f35efa65a573dd172df451b5223`
