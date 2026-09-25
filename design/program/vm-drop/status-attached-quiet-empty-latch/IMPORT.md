# IMPORT — status-attached-quiet-empty-latch

## What

Portable CPU cut for quiet `vfx._updateStatusAttachedVfx` under prepareFrame
residual after #105. Two stacked pieces:

1. **Alloc-free collect** — replace `Object.keys(combat.entities)` and
   per-entity `Object.keys(STATUS_ROWS)` with `for...in` + frozen
   `STATUS_ROW_IDS` (honors the existing alloc-free contract comment).
2. **Quiet empty latch** — after first empty collect + empty cooldown map,
   skip collect/housekeeping until `combat.statusNextPendingSeq` advances
   (new status apply). Boundary events (`sector:enter` / `game:newGame` /
   `save:loaded`) and leaving flight clear the latch.

False-wake (seq bump without burn/goo) falls through to one collect and
re-latches. Picture unchanged while no burn/goo statuses. Soft-GPU fps not
claimed.

## Live path (later, by owner)

- `src/render/statusAttachedVfx.js`
- `src/render/vfx.js`

## Apply

```bash
git am design/program/vm-drop/status-attached-quiet-empty-latch/patches/*.patch
```

Stacks under prepareFrame / vfx status-attached residual. Clean on stacked
tip through #105.

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
