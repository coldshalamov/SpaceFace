# IMPORT — select-classify-epoch-seen

## What it is

`selectClassifyEntities` no longer `Set.clear()`s and rehashes the near-disc
seen set every incremental classify. It keeps a dense `Uint32Array` of
id→epoch marks and bumps a generation counter (wrap fills zeros) — same
membership pattern as presentationQueries. Empty projectiles lane skips the
typed walk. Admit parity unchanged.

## How to apply

```bash
git fetch origin
git checkout -B import/select-classify-epoch-seen origin/master
git am design/program/vm-drop/select-classify-epoch-seen/patches/*.patch
node --test \
  test/activity-runtime.test.mjs \
  test/activity-classification.test.mjs \
  test/ceres-activity-runtime-lifecycle.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #48/#59. Stacks under classifyWorld / selectClassify.
