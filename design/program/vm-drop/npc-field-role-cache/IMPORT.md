# IMPORT — npc-field-role-cache

## What it is

Cache `npcFieldRole` against live `entity.data` / `entity.data.ai` object identities so fields.js stops re-stringifying traffic/doctrine every ship every tick.

## How to apply

```bash
git fetch origin
git checkout -B import/npc-field-role-cache origin/master
git am design/program/vm-drop/npc-field-role-cache/patches/*.patch
node --test \
  test/pq147-01-fields-for-everyone.test.mjs \
  test/pq-147-01-fields-physics.test.mjs \
  test/npc-miner-shared-field.test.mjs
```

## Picture

Untouched.

## Apply order

Independent.
