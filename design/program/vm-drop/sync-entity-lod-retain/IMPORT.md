# IMPORT — sync-entity-lod-retain (#157)

## What it is

Portable CPU cut for `syncEntityViews` projection/LOD retain. When LOD hysteresis
keeps the same band, skip `updateLod` (asteroid/station previously re-traversed
far-detail every frame; ships already self-retained). Defense-in-depth lastLod
inside asteroid + station `updateLod`. Bind clears `_appliedLodLevel`.

## Live path that receives it later

- `src/render/renderer.js` — central retain gate + bench toggle + bind clear
- `src/render/visualFactory.js` — asteroid updateLod lastLod
- `src/render/hlod.js` — station updateLod lastLod
- `test/sync-entity-lod-retain.test.mjs` — focused retain/wake tests

## What you did **not** wire

- No merge to master from this VM.
- Soft-GPU fps not claimed.
- Does not re-ship closure-gate / micromotion-settled / asteroid-settled /
  render-entity-frame retain (held or already packaged).
