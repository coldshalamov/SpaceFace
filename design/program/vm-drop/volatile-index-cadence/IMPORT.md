# IMPORT — volatile-index-cadence

## What it is

`refreshVolatileEntityIndex` no longer rebuilds `aiShips` / `weaponShips` every
preStep. append/remove already keep those lists correct for membership; mid-life
ai/weapons attach is caught on an 8-tick cadence (~133 ms).

## How to apply

```bash
git fetch origin
git checkout -B import/volatile-index-cadence origin/master
git am design/program/vm-drop/volatile-index-cadence/patches/*.patch
node --test \
  test/entity-lifecycle-residency-recycle.test.mjs \
  test/core-coreSystem.review.test.mjs \
  test/starter-weapon-runtime.test.mjs \
  test/systems-weaponsAttackRuntime.review.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #55. Stacks under registry.step / preStep residual.
