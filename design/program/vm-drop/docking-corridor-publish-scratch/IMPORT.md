# IMPORT — docking-corridor-publish-scratch

## What it is

Reuse `_publishProxyDiagnostics` out[]/Set scratch and cache the station template-key so settled stations stop rebuilding `${proxy}|x|z|rot|bearing` every tick.

## How to apply

```bash
git fetch origin
git checkout -B import/docking-corridor-publish-scratch origin/master
git am design/program/vm-drop/docking-corridor-publish-scratch/patches/*.patch
node --test \
  test/station-docking-corridor.test.mjs \
  test/collision-proxy-manifest.test.mjs
```

## Picture

Untouched.

## Apply order

Independent.
