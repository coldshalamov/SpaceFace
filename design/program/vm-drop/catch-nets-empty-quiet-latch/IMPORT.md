# IMPORT — catch-nets-empty-quiet-latch

## What it is

Quiet open flight `lootShards._catchPodsInNets` residual after #145 customs
cones: every tick still walked payloads + shipLike (`isOutlawCatchNet` /
`isJettisonedCargoPod`) while non-jettisoned payloads existed but no outlaw
catch nets and no jettisoned cargo pods. Quiet latch short-circuits the census
when both bags stay empty; wakes on membership, a live net/pod, or 0.5 s
rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/lootShards.js` (catch-nets empty quiet latch + bench toggles)
- `test/catch-nets-empty-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/catch-nets-empty-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
lifetimeSweep quiet-compact-skip / pose-rematch / sleeping-clocks /
dirty-publish / flying-early-latch / NPC visit / spatial stub / asteroid
settled / render-entity-frame retain / prepareFrame quiet-VFX /
applySnapshotPose / packCombatTable single-dirty / preStep-all-sleeping /
stampNearWork-empty / projectile-evidence surface-cadence / env-machinery far /
hazards far / weapons quiet residual deepen / impulseCharges empty /
updateDockRange far / spatialHash all-sleeping remain held. Owner applies from
`patches/` in numeric package order on master when importing. Stacks under
registry.step / lootShards residual after #145.
