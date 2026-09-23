# IMPORT — flight-propulsion-scratch

## What it is

coolRuntime retained scratch (no double object-spread) + flightV3 bodySnapshot `_sfNormalized` so stepPropulsion skips normalizeBody copy.

## How to apply

```bash
git fetch origin
git checkout -B import/flight-propulsion-scratch origin/master
git am design/program/vm-drop/flight-propulsion-scratch/patches/*.patch
node --test \
  test/flightV3.spec.mjs \
  test/velocity-vectoring.test.mjs \
  test/governor-weave.test.mjs \
  test/arcade-draw-flight.test.mjs \
  test/travel-drive.test.mjs \
  test/propulsion-spawned-ship-authority.test.mjs
```

## Picture

Untouched.

## Apply order

Independent. Clean on bare `origin/master`.
