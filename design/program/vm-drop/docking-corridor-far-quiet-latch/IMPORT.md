# IMPORT — docking-corridor-far-quiet-latch

## What it is

Quiet latch for `dockingCorridor.update` when the player is far past the
approach band of every docking-manifest station. Skips the station walk
(`resolveCollisionProxyManifest` + `corridorStateFor`) and proxy publish;
wakes on player move (~100 WU), `entityIndex.version`, or a 0.5 s rescan.
Approach / capture / berthed never latch. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/dockingCorridor.js` (far quiet latch + bench toggles)
- `test/docking-corridor-far-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/docking-corridor-far-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm.
Hazards far / env-machinery far / asteroid-field empty latch remain held.
Owner applies the patch from `patches/` in numeric package order on master
when importing. Stacks under registry.step residual after #136 poi-scan.

## Perf-backlog

Hillclimb portable CPU cut (not a numbered PERF_TOP10 row). Soft-GPU fps
owner-verify only; not claimed here.
