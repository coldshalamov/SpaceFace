# IMPORT — combat-postphysics-quiet-skip

## What

Portable CPU cut for quiet combat `postPhysics` under `registry.step` after #86:
early-out `reconcilePhysics` + `updateTelemetryAndBreak` when `attachments.byId`
has no keys (for-in O(1)), and skip the first-seen `ensureCombatant` walk when
prePhysics already covered this tick's roster (sorted cache still valid).

## Live path (later, by owner)

- `src/combat/attachments.js` — `reconcilePhysics`, `updateTelemetryAndBreak`, `hasAttachmentKeys`
- `src/combat/kernel.js` — `postPhysics`

## Apply

```bash
git am design/program/vm-drop/combat-postphysics-quiet-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
