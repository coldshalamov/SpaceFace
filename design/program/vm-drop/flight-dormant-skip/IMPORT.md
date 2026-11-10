# IMPORT — flight-dormant-skip

## How to apply

```bash
git fetch origin
git checkout -B import/flight-dormant-skip origin/master
git am design/program/vm-drop/flight-dormant-skip/patches/*.patch
node --test test/flight-dormant-skip.test.mjs test/activity-classification.test.mjs
```

Independent of prepare-pitch-settle; apply either order.

## Picture

Untouched. Portable CPU / sim only — soft-GPU fps not claimed.
