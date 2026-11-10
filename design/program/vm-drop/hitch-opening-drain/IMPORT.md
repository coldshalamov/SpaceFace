# IMPORT — hitch-opening-drain

## What it is

Soft-GPU / no-KHR opening cook: do **not** poll `opening.planWait` (8s) or
`opening.drainWait` (2s+8s) inside `prepareOpeningGpuResources`. Self-build the
submission plan when the concurrent warmup has not published one yet, freeze the
receipt without awaiting the exact-plan drain, and cap soft-GPU residency at
**750 ms** (hardware stays 5000 ms). Loading already fire-and-forgets this cook
via `shouldAwaitOpeningGpuCook === false`; the polls only contended the event
loop.

## How to apply

```bash
git fetch origin
git checkout -B import/hitch-opening-drain origin/master
git am design/program/vm-drop/hitch-opening-drain/patches/*.patch
node --test test/opening-soft-gpu-drain-skip.test.mjs
```

## Apply order

Clean on bare `origin/master` @ `59df2a08ed9684e947f79d88e1d41f5c59acbee0`. Independent of hitch-shed-floor /
hitch-asteroid-cell-key (those are already reflected on current master via lane-D
`HITCH_FRAME_TICKS=6.5` and numeric asteroid cell keys). Orthogonal to
shader-admission-slice.

## Picture defaults

Untouched. No fidelity / bloom / CAS / picture-flag changes.
