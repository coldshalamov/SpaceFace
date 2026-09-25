# IMPORT — weapons-npc-quiet-latch

## What it is

Quiet Ceres `weapons.update` residual after held packCombat single-dirty /
sampleProjectileEvidence surface-cadence / lifetimeSweep compact-skip: every
tick still walked `weaponShips` for `_tickWeapons` + NPC fire service while
non-player weapon ships slept with cold cooldown/heat. Quiet latch
short-circuits to stunt evidence + player tick/service when typed
projectile/vectorMine lanes are empty and every non-player weapon ship is
sleeping with no cooldown/heat/vent/plant/fire; wakes on membership, live
projectiles/mines, attack bag, beam owners, tactical-AI quiet clear, or
0.5 s rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/weapons.js` (NPC quiet idle latch + bench toggles)
- `test/weapons-npc-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/weapons-npc-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
lifetimeSweep quiet-compact-skip / pose-rematch / sleeping-clocks /
dirty-publish / flying-early-latch / NPC visit / spatial stub / asteroid
settled / render-entity-frame retain / prepareFrame quiet-VFX /
applySnapshotPose / packCombatTable single-dirty / preStep-all-sleeping /
stampNearWork-empty / projectile-evidence surface-cadence remain held.
Owner applies from `patches/` in numeric package order on master when
importing. Stacks under registry.step / weapons residual after #143.
