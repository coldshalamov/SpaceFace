# IMPORT — far-actor-cell-key

## What it is

Replace `${cx}:${cz}` string keys in `farActorTable` grid with packed `Number` keys
(same offset/stride encoding as asteroidField). `queryFarActors` / `gridAdd` /
`gridRemove` / in-tab string→number migrate via `ensureFarActorTable`.

## How to apply

```bash
git fetch origin
git checkout -B import/far-actor-cell-key origin/master
git am design/program/vm-drop/far-actor-cell-key/patches/*.patch
node --test test/far-actor-cell-key.test.mjs test/far-actors.test.mjs
```

## Apply order

Clean on bare `origin/master`. Independent of `asteroid-query-callers`.
