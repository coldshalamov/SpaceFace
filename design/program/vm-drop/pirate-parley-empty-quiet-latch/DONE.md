# DONE — pirate-parley-empty-quiet-latch

## Summary

Quiet flight still paid `pirateParley.update`'s full shipLike walk
(`eligiblePlan` / `robberyEligibility` / Map alloc) every tick while no
toll-doctrine squads and no unresolved parley records remained. Quiet latch
short-circuits the census when empty; wakes on membership, toll spawn/tag
(`noteParleyWake`), or 0.5 s rescan. Soft-GPU fps not claimed. Picture
contract ON / unchanged (no parley scan start when quiet).

Fresh combat residual outside held lifetimeSweep / classify / sync /
weapons residual deepen / customs cones #145 / catch-nets #146 /
sanctuary #147 / salvage #148 / bountyHunt #149 / pirateDisengage #150 /
flybyFocus thin-abs clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `pirateParley.update` × 60k; 49 ships (player + 48 passive); no toll
squads. Before = latch OFF; after = latch ON. Isolated Node child processes
(`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet pirateParley shipLike census (5×11-pair floors) | **~21.0–21.9×** | **≥13.27×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~21.92 / 21.00 /
21.55 / 21.79 / 21.51; mins across those runs ≥13.27×. Floor across package
runs **≥13.27×** (clears ≥1.5× bar). Dirty-wake proved: spawn toll via
`ai.doctrine:'toll'` + cargo → latch clears → scan phase starts
(`dirtyWakeOk: true`). Focused latch + prior suites **61/61**. Soft-GPU fps
not claimed.

Abs before ~2.10–2.15 µs/call (well above flybyFocus deferred band ~0.55 µs /
bountyHunt ~0.58 µs). Profile cite through #64 did not name pirateParley
self; residual is the empty toll census on the combat clock (ranked pole #2
combat / registry.step / law wanted·ambient adjacent).

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#150; prefer NEW combat /
law angles outside held clusters.

### Focused tests

`node --test test/pirate-parley-empty-quiet-latch.test.mjs test/pirate-disengage-empty-quiet-latch.test.mjs test/bounty-hunt-empty-quiet-latch.test.mjs test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **61/61** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`14d1b9944`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924n`
- Tip: `73995d8ae3e82a5fd94ed9f00594535e6e98d042`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `14d1b994493f43571432f397feede02993af8b0e`
