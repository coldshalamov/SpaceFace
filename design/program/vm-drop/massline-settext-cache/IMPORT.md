# IMPORT — massline-settext-cache

## What it is

Cache last-written string on massline `setText` (`el._sfText`). Unchanged cue/preview labels skip DOM `textContent` reads.

## How to apply

```bash
git fetch origin
git checkout -B import/massline-settext-cache origin/master
git am design/program/vm-drop/massline-settext-cache/patches/*.patch
node --test \
  test/massline-acquisition-preview.test.mjs \
  test/massline-presentation-uvp.test.mjs \
  test/massline-orbit-telemetry.test.mjs \
  test/massline-input-grammar.test.mjs \
  test/hud-flight-attention.test.mjs \
  test/physics-hud-dom-writes.test.mjs \
  test/j07-hud-contract.test.mjs
```

## Picture

Untouched. Same writes when the string actually changes.

## Apply order

Independent. Clean on bare `origin/master`.
