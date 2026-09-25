# DONE — sanctuary-empty-quiet-latch

## Summary

Quiet flight still paid `lawSecurity._enforceSanctuaryWithdrawals`' full
aiShips walk (`isArmedNpc` / `isLawful` / target bag) every tick while
armed unlawful NPCs existed but held no chase/fire signal. Quiet latch
short-circuits the walk when no aggressive candidate remains; wakes on
membership, combat fire/damage seq, tactical AI wake, or 0.5 s rescan.
Soft-GPU fps not claimed. Picture contract ON / unchanged (no withdrawal
when quiet).

Fresh law residual (sanctuary) outside held lifetimeSweep / classify / sync /
weapons residual deepen / customs cones #145 / catch-nets #146 clusters.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `_enforceSanctuaryWithdrawals` × 60k; 48 lawful + 8 idle unlawful
aiShips; no chase/fire signals. Before = latch OFF; after = latch ON.
Isolated Node child processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet sanctuary walk (5×11-pair floors) | **~14.58–15.87×** | **≥10.34×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~14.58 / 15.74 /
14.90 / 15.46 / 15.87; mins across those runs ≥10.34×. Floor across package
runs **≥10.34×** (clears ≥1.5× bar). Dirty-wake proved: chase into station
jurisdiction (`dirtyWakeOk: true`; `sanctuaryWithdrawn` +
`jurisdiction_withdrawal`). Focused latch + prior suites **49/49**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` /
`settled-20s-stacked-20260924ad` (Picture ON): `_enforceSanctuaryWithdrawals`
residual under lawSecurity after #145/#146 removed cones/catch-nets share.

### Focused tests

`node --test test/sanctuary-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/catch-nets-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **49/49** pass.

Clean master `git am --ignore-space-change` verify @ `4b28a8323` → tip
`b2442fb8a`; focused **4/4**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `8113f3292a1e2fd987b4ba1354cc76fdcbe0594a`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
- Master am SHA: `b2442fb8a144c8df32a0be57acac34c26fec905a`
