# IMPORT — gamepad-idle-clean-skip

## What it is

Disconnected (no pad) gamepad polls no longer rebuild the 21-action sample map
every tick. After the first idle zero publish, `_idleClean` skips `_resetState`.
Real resets (disconnect / explicit) reuse action sample objects in place.

## How to apply

`gamepad.js` is CRLF on master; use `--ignore-space-change`:

```bash
git fetch origin
git checkout -B import/gamepad-idle-clean-skip origin/master
git apply --ignore-space-change design/program/vm-drop/gamepad-idle-clean-skip/patches/*.patch
git add -- src/systems/gamepad.js && git commit -m "perf(input): skip disconnected gamepad action-map rebuild (~3.5x)"
node --test test/inf-098-gamepad-reconnect.test.mjs \
  test/input-lifecycle.test.mjs \
  test/help-gamepad-rebind.test.mjs \
  test/pq-164-00-gamepad-screens.test.mjs
```

Prefer after #54. Independent of classify/render poles.

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Stacks under registry.step / input residual after #39+#43+#49+#50.
