# IMPORT — radar-contacts-still-layer (#158)

## What it is

Portable CPU cut for `radar.draw` contact census. When quantized player pose,
range, target, and contact-pose signature hold, skip projection +
`isHostileToPlayer` and reuse retained mark lists. Glyph paint stays live
(pickup pulses keep `now`). Soft-GPU fps not claimed. Picture contract ON.

## Live path that receives it later

- `src/ui/radar.js` — `censusRadarContactsStillLayer` + bench toggle + draw() wire
- `test/radar-contacts-still-layer.test.mjs` — focused retain/wake tests

## How to apply

```
git am --ignore-space-change design/program/vm-drop/radar-contacts-still-layer/patches/*.patch
```

## What you did **not** wire

- No merge to master from this VM.
- Soft-GPU fps not claimed.
- Does not re-ship radar-asteroid-still-layer (#156) / objective plate cache /
  setLag / contact-color-defer (already packaged or on master).
- Objective idle deepen measured thin (~0.37 µs) — not packaged.
