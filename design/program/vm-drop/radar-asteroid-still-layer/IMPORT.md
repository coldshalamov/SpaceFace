# IMPORT — radar-asteroid-still-layer (#156)

## What it is

Quiet `radar.draw` (10 Hz) still walked the full `asteroidSource` census every
tick even when the pilot had not moved a radar pixel. Dormant field rocks do
not translate, so a quantized-player **still-layer** reuses the last field-cell
+ near-dot census until pose / range / target / field.version / index.version
changes or a 0.5 s rescan. Also batches `drawTrail` to one path/stroke at mid
alpha (was per-segment fade strokes).

## Live path

- `src/ui/radar.js` — `censusRadarAsteroidStillLayer`, drawTrail batch, bench toggles
- `test/radar-asteroid-still-layer.test.mjs`

## Apply

```bash
git checkout -B import/radar-asteroid-still-layer origin/master
git am design/program/vm-drop/radar-asteroid-still-layer/patches/*.patch
```

Clean `git am` on master tip `97c88f92b` → `813ef9a67`. Focused **17/17**.

## What you did not wire

No gameplay / picture-contract changes beyond uniform trail alpha (0.12 mid of
prior 0–0.2 fade). Soft-GPU fps not claimed.
