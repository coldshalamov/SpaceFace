# IMPORT — stamp-near-work-budget-early-exit

## What

Portable CPU cut for quiet `stampNearWorkBudget`: skip always-awake `Set.add`
(hasNearWorkSlot already short-circuits on the cached bit) and early-exit the
shipLike scan once the rotating S1 NEAR token budget is full.

## Live path (later, by owner)

- `src/core/activityScheduler.js` — `stampNearWorkBudget`

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
