# IMPORT — presentation-query-pose-dirty-retain

## What it is

Quiet `prepareFrame` → `syncEntityViews` → `presentationQueries.query` residual
after #74+#77: TRANSFORM-only dirties on already-visible roots (player yaw /
NPC drift on glass) blocked zero-dirty retain every frame, so spatial
collect/sort/exactVisible re-ran. Pose-dirty retain re-checks exactVisible only
on those dirty slots; hides any that left the cull; newcomers and
BINDING/VISUAL/VISIBILITY dirties fail open to the full walk. Soft-GPU fps not
claimed.

## Live path that would receive it

- `src/render/presentationQueries.js` (pose-dirty retain + bench toggles)
- `test/presentation-query-pose-dirty-retain.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/presentation-query-pose-dirty-retain/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
flying-early-latch / classify id-replay / rock visit-context / prepareFrame
quiet-VFX / hazards far / env-machinery far / asteroid-field empty /
applySnapshotPose / packCombatTable single-dirty / lifetimeSweep compact-skip /
lifetimeSweep no-movable / preStep-all-sleeping remain held. Owner applies from
`patches/` in numeric package order on master when importing. Stacks under
syncEntityViews / presentationQueries residual after #77.
