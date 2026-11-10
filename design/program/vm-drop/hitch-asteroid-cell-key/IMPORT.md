# IMPORT — hitch-asteroid-cell-key

## What it is

Replace `${cx}:${cz}` string keys in `asteroidField` grid with packed `Number` keys
(`packAsteroidFieldCellKey`). `queryAsteroidField` / `gridAdd` / legacy migrate via
`ensureAsteroidField`. No gameplay / promotion / radius behavior change (redundant
`d2 <= r2` branch removed because `reach >= r`).

## How to apply

```bash
git fetch origin
git checkout -B import/hitch-asteroid-cell-key origin/master
git am design/program/vm-drop/hitch-asteroid-cell-key/patches/*.patch
node --test test/asteroid-field-cell-key.test.mjs test/asteroid-field.test.mjs
```

## Apply order

Clean on bare `origin/master`. Independent of `hitch-shed-floor` (orthogonal).
Can stack either order.
