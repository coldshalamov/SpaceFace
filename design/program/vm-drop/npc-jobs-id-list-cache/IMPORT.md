# IMPORT — npc-jobs-id-list-cache

## What it is

Cache `Object.keys(npcJobs.byId)` across settled ticks in `npcJobsRuntime.update`. ~**2.4×** on the keys+walk microbench.

## How to apply

```bash
git fetch origin
git checkout -B import/npc-jobs-id-list-cache origin/master
git am design/program/vm-drop/npc-jobs-id-list-cache/patches/*.patch
node --test \
  test/npc-jobs-runtime-wiring.test.mjs \
  test/npc-jobs-runtime-convergence.test.mjs \
  test/npc-jobs-runtime-spatial-query.test.mjs \
  test/npc-jobs-kernel.test.mjs \
  test/npc-jobs-working-trades.test.mjs \
  test/npc-jobs-runtime-towing.test.mjs
```

## Picture

Untouched.

## Apply order

Independent.
