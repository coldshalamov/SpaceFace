# IMPORT — prestep-movables-trust

## What it is

`core.preStep` no longer re-checks `isMovableEntity` while walking
`index.movables`. That lane is already append-gated; the every-tick re-check
re-entered `isDynamicPhysicsBodyEntity` → `authoredPhysicsBody` /
`defaultDynamic` on the quiet preStep pole.

## How to apply

```bash
git fetch origin
git checkout -B import/prestep-movables-trust origin/master
git am design/program/vm-drop/prestep-movables-trust/patches/*.patch
node --test \
  test/entity-lifecycle-residency-recycle.test.mjs \
  test/core-coreSystem.review.test.mjs \
  test/dynamic-physics-render-interpolation.test.mjs \
  test/performance-lifecycle-contracts.test.mjs \
  test/pq-148-01-volatile-classes.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #58. Stacks under registry.step / preStep residual.
