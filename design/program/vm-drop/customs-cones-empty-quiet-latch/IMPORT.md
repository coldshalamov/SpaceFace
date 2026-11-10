# IMPORT — customs-cones-empty-quiet-latch

## What it is

Quiet Ceres `lawSecurity._updateCustomsScanCones` residual after held
env-machinery far / hazards far: every tick still walked every job-interactable
(`customsScanConeOf` over shipLike+stations+wrecks+payloads+pickups) while no
customs scanners and no jettisoned cargo pods existed. Quiet latch
short-circuits the census when both bags stay empty; wakes on membership, a
live scanner/pod, or 0.5 s rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/lawSecurity.js` (customs cones empty quiet latch + bench toggles)
- `test/customs-cones-empty-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/customs-cones-empty-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
lifetimeSweep quiet-compact-skip / pose-rematch / sleeping-clocks /
dirty-publish / flying-early-latch / NPC visit / spatial stub / asteroid
settled / render-entity-frame retain / prepareFrame quiet-VFX /
applySnapshotPose / packCombatTable single-dirty / preStep-all-sleeping /
stampNearWork-empty / projectile-evidence surface-cadence / env-machinery far /
hazards far remain held. Owner applies from `patches/` in numeric package
order on master when importing. Stacks under registry.step / lawSecurity
residual after #144.
