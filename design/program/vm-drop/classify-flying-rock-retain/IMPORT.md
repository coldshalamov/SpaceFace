# IMPORT — classify-flying-rock-retain

## What it is

Flying residual under #138 early quiet latch (parked-only). When the player is
moving, parked rock-visit / frame-retain / early latch do not fire, so quiet
Ceres still paid full visit clear + resolvePins / classifyActivity / applyStamp.
Flying frame retain keeps prior id lists when the visit set is unchanged and
every rock's glass/runway membership, pin bits, sim tier, and pose stay stable;
per-rock flying retain covers partial disc churn. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/world/activityRuntime.js` (flying rock retain + flying frame retain + bench toggles)
- `test/classify-flying-rock-retain.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/classify-flying-rock-retain/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
classify id-replay / rock visit-context / prepareFrame quiet-VFX /
hazards far / env-machinery far / asteroid-field empty / applySnapshotPose /
packCombatTable single-dirty / lifetimeSweep no-movable / lifetimeSweep
compact-skip remain held. Owner applies from `patches/` in numeric package
order on master when importing. Stacks under classifyWorld residual after #138.
