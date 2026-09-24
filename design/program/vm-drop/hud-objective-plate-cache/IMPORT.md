# IMPORT — hud-objective-plate-cache

## What it is

Quiet settled profile attributed **~37 ms** `getBoundingClientRect` self entirely
to `plateBox` via `objectiveEdgeObstacles` (edge objective arrow). The 500 ms
timer forced sync layout every half-second while the arrow rode an edge.

Cache plate boxes until **window resize** (or first edge use). Picture unchanged.

## How to apply

```bash
git fetch origin
git checkout -B import/hud-objective-plate-cache origin/master
git am design/program/vm-drop/hud-objective-plate-cache/patches/*.patch
node --test test/hud-objective-plate-cache.test.mjs test/orrery-hud-adapter.test.mjs
```

Clean on bare master **`f4150f648`**.

## Apply order

Independent. Complements #34 hud-credits-pulse-no-reflow.

## Picture

Untouched. Pulse / ORRERY left-column gate preserved.
