# DONE — weapons-npc-quiet-latch

## Summary

Production quiet flight still paid `weapons.update`'s weaponShips walk
(`_tickWeapons` + NPC fire service) every tick while every non-player weapon
ship slept with cold cooldown/heat and typed projectile/vectorMine lanes were
empty. Quiet latch short-circuits to stunt evidence + player tick/service;
wakes on membership, live projectiles/mines, attack bag, beams, tactical-AI
quiet clear, or 0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON /
unchanged.

Different angle from held packCombat single-dirty, sampleProjectileEvidence
surface-cadence deepen, preStep-all-sleeping, and lifetimeSweep
quiet-compact-skip (#144 miss).

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `weapons.update` × 80k; 36 sleeping NPC weapon ships + player. Before =
latch OFF; after = latch ON. Isolated Node child processes (`--expose-gc`) per
package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| npc36 quiet (5×11-pair floors) | **~2.50–2.56×** | **≥2.08×** |
| in-process cite (21-pair) | ~2.92× | ≥2.65× |

Package floor capture (5×11-pair isolated @ 80k npc36): medians ~2.55 / 2.51 /
2.56 / 2.56 / 2.50; mins across those runs ≥2.08×. Floor across package runs
**≥2.08×** (clears ≥1.5× bar). Dirty-wake proved: tactical-AI quiet clear +
typed projectile lane (`dirtyWakeOk: true`). Focused latch + prior suites
**39/39**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` /
`settled-20s-stacked-20260924ad` (Picture ON): `weapons.update` residual under
registry.step after #143.

### Focused tests

`node --test test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **39/39** pass.

Clean master `git am` verify @ `4b28a8323` → tip `324ee2f12`; focused **7/7**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `1dcac9e5f0f67be2120a18bb39ab4c8d90d9899c`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
- Master am SHA: `324ee2f124993696d567ba823e312fa4530bbe79`
