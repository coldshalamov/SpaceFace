# IMPORT — sync-entity-views-closure-gate

## How to apply

```bash
git fetch origin
git checkout -B import/sync-entity-views-closure-gate origin/master
git am design/program/vm-drop/sync-entity-views-closure-gate/patches/*.patch
node --test test/entity-view-sync-band.test.mjs test/entity-mesh-visibility.test.mjs test/advanced-micro-motion.test.mjs
```

Independent of submit-scratch; apply either order.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.
