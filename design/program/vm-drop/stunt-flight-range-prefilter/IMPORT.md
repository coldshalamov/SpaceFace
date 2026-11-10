# IMPORT — stunt-flight-range-prefilter

## What it is

`StuntFlightObserver` threat scan: type filter (ship/projectile/drone) + 2400 WU range before `isHostileForAI`, so far rocks/pickups/traffic skip the oracle.

## How to apply

```bash
git fetch origin
git checkout -B import/stunt-flight-range-prefilter origin/master
git am design/program/vm-drop/stunt-flight-range-prefilter/patches/*.patch
node --test \
  test/stunt-combo.test.mjs \
  test/stunt-taxonomy.test.mjs \
  test/pq-155-03-stunts-pay.test.mjs
```

## Picture

Untouched.

## Apply order

Independent. Pairs well after `hostile-for-ai-earlyout`.
