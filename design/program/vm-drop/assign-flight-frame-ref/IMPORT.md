# IMPORT — assign-flight-frame-ref

## What it is

Attach propulsion `result.telemetry` by reference in `assignFlightFrame` instead of `Object.assign` into a retained `_flightFrame`. ~**3.36×** offline; also drops stale optional keys.

## How to apply

```bash
git fetch origin
git checkout -B import/assign-flight-frame-ref origin/master
git am design/program/vm-drop/assign-flight-frame-ref/patches/*.patch
node --test \
  test/flightV3.spec.mjs \
  test/flight-actuator-telemetry.test.mjs \
  test/vp220-propulsion-family.test.mjs \
  test/thruster-propulsion-vocabulary.test.mjs \
  test/propulsion-spawned-ship-authority.test.mjs \
  test/dead-player-flight-step.test.mjs
```

## Picture

Untouched.

## Apply order

Independent. After `flight-propulsion-scratch` if both land.
