# IMPORT — tactical-ai-quiet-latch

## What it is

Quiet latch for production `tacticalAI.update` when no non-player shipLike
entity needs AI think (player-only quiet flight / all-dormant far traffic).
Skips cohort stamp, squad/fodder steps, stack update, and maneuver replay.
Probes think interest every tick so `nextEventAtT` / pin flips wake without
membership churn. Injected-port fixtures keep every-tick cadence. Soft-GPU
fps not claimed.

## Live path that would receive it

- `src/systems/tacticalAI.js` (quiet latch + bench toggles)
- `test/tactical-ai-quiet-latch.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/tactical-ai-quiet-latch/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
classify id-replay / rock visit-context / prepareFrame quiet-VFX /
hazards far / env-machinery far / asteroid-field empty remain held.
Owner applies from `patches/` in numeric package order on master when
importing. Stacks under registry.step / tacticalAI residual after #138.
