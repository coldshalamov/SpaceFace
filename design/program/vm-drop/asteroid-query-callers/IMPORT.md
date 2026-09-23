# IMPORT — asteroid-query-callers

## What it is

1. `appendNearbyLedgerRows`: rock `queryAsteroidField` uses collect-horizon +
   player travel (+ one cell slack); far actors keep the promote+inbound disc.
2. `requestDecodeRunwayPromote`: drop per-tick field query that only set
   `rocksSeen` (`rocksPromoted` always 0).
3. `queryAsteroidField`: drop redundant `d2 <= r2` branch (`reach >= r`).

## How to apply

```bash
git fetch origin
git checkout -B import/asteroid-query-callers origin/master
git am design/program/vm-drop/asteroid-query-callers/patches/*.patch
node --test test/asteroid-field.test.mjs test/decode-runway-residency.test.mjs test/presentation-mesh-collect.test.mjs
```

## Apply order

Clean on bare `origin/master` (cell-key already merged). Independent of
`far-actor-cell-key`. Stack either order.

## Picture

Untouched. Rock ledger collect still admits via time-to-glass on player approach.
