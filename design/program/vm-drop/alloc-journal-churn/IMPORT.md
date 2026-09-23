# IMPORT — alloc-journal-churn

## What it is

`PresentationJournal` now coalesces **transform** and **visual** records **across
ticks** while the prior record for that entity/generation/kind is still retained.
Soft-GPU presents slower than the sim; the old same-tick-only coalesce left one
append per mover per tick (top alloc-profile site: `append @ presentationJournal`).
In-place overwrite updates tick + revision + pose/visual scalars. Spawn/destroy
paths unchanged. `refreshCoalescedRecords` advances later same-entity retained
rows so revision/tick never move backwards in sequence order.

## How to apply

```bash
git fetch origin
git checkout -B import/alloc-journal-churn origin/master
git am design/program/vm-drop/alloc-journal-churn/patches/*.patch
node --test test/presentation-journal.test.mjs
```

## Apply order

Clean on bare `origin/master` @ `59df2a08ed9684e947f79d88e1d41f5c59acbee0`. Independent of `hitch-opening-drain`.
Can stack either order.

## Picture defaults

Untouched.
