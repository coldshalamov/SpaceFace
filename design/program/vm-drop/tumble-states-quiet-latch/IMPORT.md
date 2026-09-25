# IMPORT — tumble-states-quiet-latch

## What it is

Quiet latch for production `tumbleStates.update` when no ship/drone is
tumbling, RCS-disrupted, recovering, or drive-disabled drifting. Skips the
shipLike walk and RCS provenance scan. Wakes on entity-index membership,
impulse provenance generation (RCS discovery), tumble begin (event paths),
or a 0.5 s rescan (drive-disabled drift without impulse). Soft-GPU fps not
claimed.

## Live path that would receive it

- `src/systems/tumbleStates.js` (quiet latch + bench toggles)
- `src/combat/impulseKernel.js` (`impulseProvenanceGeneration` wake signal)
- `test/tumble-states-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/tumble-states-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
classify id-replay / rock visit-context / prepareFrame quiet-VFX /
hazards far / env-machinery far / asteroid-field empty / applySnapshotPose /
packCombatTable single-dirty / lifetimeSweep no-movable remain held.
Owner applies from `patches/` in numeric package order on master when
importing. Stacks under registry.step / tumbleStates residual after #139.
