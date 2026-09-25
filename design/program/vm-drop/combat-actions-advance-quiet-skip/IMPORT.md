# IMPORT — combat-actions-advance-quiet-skip

## What

Portable CPU cut for quiet combat `actions.advance` under `registry.step` /
`prePhysics` after #85: early-out when `requests` is empty and `activeByActor`
has no keys (for-in O(1) emptiness), skip `processRequests` alloc +
`Object.keys().sort()` on the quiet path, and reuse due/future scratch with
in-place `requests` retain when work is pending.

## Live path (later, by owner)

- `src/combat/actions.js` — `advance`, `processRequests`

## Apply

```bash
git am design/program/vm-drop/combat-actions-advance-quiet-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
