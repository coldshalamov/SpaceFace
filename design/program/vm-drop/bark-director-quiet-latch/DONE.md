# DONE — bark-director-quiet-latch

## Summary

Quiet flight still paid `barkDirector.update`'s `ensureActivityClassified` +
living-actor bark/hail walk every tick while no eligible speak, hail,
near-miss, or stunt work remained. Quiet latch short-circuits that census when
quiet; wakes on membership, ship/drone spawn (`noteBarkWake`), combat/stunt/
body-near-miss cues, or 0.5 s rescan. Soft-GPU fps not claimed. Picture
contract ON / unchanged (observer-only radio; no bark text when quiet).

Fresh registry.step / radio residual outside held flybyFocus #152 /
pirateParley #151 / pirateDisengage #150 / bounty #149 / salvage #148 /
sanctuary #147 / cones #145 / catch-nets #146 clusters. Abs before
~7.6–8.0 µs/call clears the thin-abs band.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `barkDirector.update` × 60k; 49 ships (player + 48 far neutrals);
no eligible bark/hail/near-miss/stunt. Before = latch OFF; after = latch ON.
Isolated Node child processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet barkDirector bark/hail census (5×11-pair floors) | **~12.4–13.3×** | **≥8.31×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~13.28 / 12.96 /
12.62 / 13.22 / 12.40; mins across those runs ≥8.31×. Floor across package
runs **≥8.31×** (clears ≥1.5× bar). Abs before ~7.6–8.0 µs/call. Dirty-wake
proved: spawn attacking hostile → latch clears → bark speaks
(`dirtyWakeOk: true`). Focused latch + prior suites **76/76**. Soft-GPU fps
not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after …+#152; prefer NEW angles outside
held clusters. This pass claimed barkDirector full-update quiet census.

### Focused tests

`node --test test/bark-director-quiet-latch.test.mjs test/flyby-focus-empty-quiet-latch.test.mjs test/flyby-focus.test.mjs test/pirate-parley-empty-quiet-latch.test.mjs test/pirate-disengage-empty-quiet-latch.test.mjs test/bounty-hunt-empty-quiet-latch.test.mjs test/salvage-unstable-quiet-empty-latch.test.mjs test/sanctuary-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/body-near-miss-bark.test.mjs test/encounter-barks.test.mjs`
→ **76/76** pass.

Clean master `git am --ignore-space-change` verify @ `97c88f92b` → tip
`52c70d05f`; focused latch **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924n`
- Tip: `cf0c7b6a744552678827f4e18a819aef57b47bee`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `97c88f92b`
- Master am SHA: `52c70d05f443197258032abdad43aa3f3623052e`
