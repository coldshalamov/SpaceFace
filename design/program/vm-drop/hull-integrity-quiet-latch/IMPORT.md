# IMPORT — hull-integrity-quiet-latch (#164)

## What

Quiet-latch the settled hull-integrity instrument's DOM compare pass in
`updateShipCondition` (`src/ui/views/hullIntegrity.js`). In-page on bare
master: median **~21×** tight / **~10×** per-frame, floor **≥8.6×**. This
removes about 55 µs of main-thread work per presented frame in quiet flight.

## Apply

```
git am --ignore-space-change design/program/vm-drop/hull-integrity-quiet-latch/patches/*.patch
```

Base: master tip `97c88f92b`. Am-verify tip `ae3f81c0f`. The patch is
independent of #165 `perf-heap-sample-gate` and applies before or after it
(both-applied tip `d374c3891`).

## Claims

This is a presentation-thread HUD residual (`hud.frame` → `updateShipCondition`),
not soft-GPU fps. It is fresh: it is not radar #156/#158, objective idle,
closure-gate, LOD, shield-bubble, or any registry.step latch.

## Owner-GPU

No headed verification is required. The skip happens only when every attribute
compare would have been equal, so the DOM is picture-identical. A focused test
checks the latched and unlatched paths frame by frame for equality over a
6000-frame mixed run. Picture contract ON.
