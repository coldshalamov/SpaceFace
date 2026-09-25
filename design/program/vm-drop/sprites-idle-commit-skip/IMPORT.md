# IMPORT — sprites-idle-commit-skip

## What

Portable CPU cut for quiet `_integrateSprites` under prepareFrame /
renderUpdate residual after #115. Two stacked pieces:

1. **Quiet idle-publish latch** — after the first `reset`+`commit(0)` across
   the four glow/ring/smoke/combustion buckets while `liveSpriteCount===0`,
   skip re-assert/re-commit until a wake fires. Mesh.count is already 0.
2. **Dirty wake** — `_activateSprite` clears `_spritesPublishedIdle` so the
   next integrate rebuilds buckets. Drain back to empty re-latches after one
   publish.

Picture unchanged while no sprites are live. Soft-GPU fps not claimed. Live
sprite integrate path is unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` (`_integrateSprites`, `_activateSprite`, init flag)
- `test/sprites-idle-commit-skip.test.mjs` (latch contract)

## Apply

```bash
git am design/program/vm-drop/sprites-idle-commit-skip/patches/*.patch
```

Stacks under prepareFrame / renderUpdate / sprite integrate residual. Clean on
stacked tip through #115. Sibling of #92 particles-idle-commit-skip.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
