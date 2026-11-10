# DONE — ai-encounter-quiet-latch (#161)

## Summary

Quiet open flight still paid `aiEncounter.update`'s full `shipLike` walk every
tick for authored reinforcement callers (`data.reinforcements.packageId` not yet
`_calledReinforcements`), even when no such authors existed and no pending
spawn/command work was live. Production now **quiet-latches** that path (and
skips `ensure*` while latched); wakes on entity-index membership, combat /
spawn / destroy / save / sector enter / new-game, command·pending·seq churn, or
0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON (no reinforcement
scan while latched).

Fresh registry.step residual after #160; not a rediscovery of packCombat /
stampNear / lifetime / classify / trust-sleep / bandRadio / traffic / law /
combat pre+post / factionPresence packages. Abs before ~1.10–1.20 µs @ 40 ships
clears a quiet latch with strong relative floor (≥3.34×).

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `aiEncounter.update` × 30k; 40 idle ships, no reinforcement authors, no
pending spawn/command work. Latch OFF vs ON. Isolated Node child processes
(`--expose-gc`) per pair. Measured on clean master tip `97c88f92b` + this patch
(am-verify).

| | median | floor minSpeedup |
|---|---:|---:|
| idle aiEncounter quiet-latch (5×11-pair floors) | **~3.96–4.13×** | **≥3.34×** |

Package floor capture (5×11-pair isolated @ 30k, N=40): medians 4.130 / 4.108 /
4.057 / 3.956 / 4.047; mins across those runs ≥3.338×. Floor across package
runs **≥3.34×** (clears ≥1.5× bar). Abs before ~1.10–1.20 µs. Dirty-wake proved:
reinforcement-author spawn + hull-threshold fire / combat:damage bus. Focused
latch + INF-028 fair-reinforcements **8/8**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `registry.step` residual; broad ungated scour after #160 named
`aiEncounter` ~1.6 µs and `encounterDirector` ~2 µs as next unpackaged
residuals (encounterDirector already 1 Hz — early path thin ~0.4 µs).

### Focused tests

```
node --test \
  test/ai-encounter-quiet-latch.test.mjs \
  test/inf-028-fair-reinforcements.test.mjs
```
→ **8/8** pass (am-verify tip `3b8cae680`).

Clean master `git am --ignore-space-change` verify: this patch → tip `3b8cae680`
on base `97c88f92b`.

## Scratch

- Branch: `vm-work/hillclimb-20260924t`
- Tip: `cc826f4873b2205ffa2977a4eea9acd65807e33c`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924p`

## Apply order

Independent of combat/classify/sync/factionPresence packages. After prior
registry.step packages already on master / awaiting import. Complements (does
not rediscover) bark/flyby/pirate*/factionPresence empty latches. Stacks under
registry.step.

## Risks

- Quiet latch stays armed while no unrecalled reinforcement authors and no
  pending spawn/command work; 0.5 s rescan + membership/wake-seq + bus wakes
  keep reinforcement calls honest.
- Bench toggle off restores always-scan for A/B.
- Mid-life reinforcement-author spawn / combat damage / sector enter wakes via
  wake seq.
