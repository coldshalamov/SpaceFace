# DONE — catch-nets-empty-quiet-latch

## Summary

Quiet flight still paid `lootShards._catchPodsInNets`'s full payloads+shipLike
census (`isOutlawCatchNet` / `isJettisonedCargoPod`) every tick while
non-jettisoned payloads existed but no outlaw catch nets and no jettisoned
cargo pods. Quiet latch short-circuits the census when both bags stay empty;
wakes on membership, a live net/pod, or 0.5 s rescan. Soft-GPU fps not
claimed. Picture contract ON / unchanged (no catch when empty).

Fresh subsystem (lootShards) outside held lifetimeSweep / classify / sync /
weapons residual / customs cones clusters. Same helpers as #145 cones, different
owner — residual after the cones latch removed the lawSecurity census.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `lootShards.update` × 60k; 49 ships + 16 non-jettisoned payloads; no nets
/ no jettisoned pods. Before = latch OFF; after = latch ON. Isolated Node child
processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet census (5×11-pair floors) | **~9.71–10.11×** | **≥8.50×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~9.90 / 9.98 / 10.11 /
10.00 / 9.71; mins across those runs ≥8.50×. Floor across package runs **≥8.50×**
(clears ≥1.5× bar). Dirty-wake proved: outlaw catch-net + jettisoned pod spawn
(`dirtyWakeOk: true`; pod caught). Focused latch + prior suites **45/45**.
Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture ON):
`isJettisonedCargoPod` / `isOutlawCatchNet` residual under lootShards after #145
cones removed the lawSecurity census share.

### Focused tests

`node --test test/catch-nets-empty-quiet-latch.test.mjs test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **45/45** pass.

Clean master `git am` verify @ `4b28a8323` → tip `5561a2968`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `3c7e1f748800a57211dea58dc347462b2d8872b1`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
- Master am SHA: `5561a296887dbc20261de6eeac6a2351d69cb0d6`
