# IMPORT — sync-entity-views-submit-scratch

## How to apply

```bash
git fetch origin
git checkout -B import/sync-entity-views-submit-scratch origin/master
git am design/program/vm-drop/sync-entity-views-submit-scratch/patches/*.patch
node --test test/entity-mesh-visibility.test.mjs
```

Independent of closure-gate; apply either order. Updates the source contract in
`test/entity-mesh-visibility.test.mjs` (literal call shape → scratch field writes
+ hidden closed form).

## Picture

Untouched. Portable CPU / alloc only.
