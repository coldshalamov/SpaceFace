# IMPORT — hud-settext-cache

## What it is

Cache last-written string on `setText` (`el._sfText`), mirroring `setStyle`.
Unchanged HUD labels skip the DOM `textContent` read/walk.

## How to apply

```bash
git fetch origin
git checkout -B import/hud-settext-cache origin/master
git am design/program/vm-drop/hud-settext-cache/patches/*.patch
node --test \
  test/hud-contact-roster-keyed-rows.test.mjs \
  test/hud-contact-roster-visibility.test.mjs \
  test/hud-layout.test.mjs \
  test/j07-hud-contract.test.mjs \
  test/hud-flight-attention.test.mjs \
  test/physics-hud-dom-writes.test.mjs
```

## Picture

Untouched. Same writes when the string actually changes.

## Apply order

Independent. Clean on bare `origin/master`.
