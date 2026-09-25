# IMPORT — prepare-pitch-settle

## How to apply

```bash
git fetch origin
git checkout -B import/prepare-pitch-settle origin/master
git am design/program/vm-drop/prepare-pitch-settle/patches/*.patch
node --test test/ship-pitch-presentation.test.mjs test/massline-presentation-uvp.test.mjs test/shadow-present-cadence.test.mjs
```

Independent of flight-dormant-skip; apply either order.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.
