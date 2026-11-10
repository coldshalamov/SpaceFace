# IMPORT — rcs-impulse-quiet-empty-skip

## What

Portable CPU cut for quiet `RcsImpulseSystem.update` under prepareFrame /
thruster residual after #97. After the first empty publish, skip event-light
churn + layer batch clear/commit/uniforms; pool only retires previously-active
slots instead of zeroing capacity. Picture unchanged when idle. Soft-GPU fps
not claimed.

## Live path (later, by owner)

- `src/render/thruster/systems/rcsImpulse.js`

## Apply

```bash
git am design/program/vm-drop/rcs-impulse-quiet-empty-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
