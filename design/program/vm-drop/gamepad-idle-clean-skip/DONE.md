# DONE — gamepad-idle-clean-skip

## Summary

Quiet keyboard/mouse flight has no gamepad, yet `createGamepad().tick` rebuilt
the full ACTION_MAP sample object (21 fresh `{held,pressed,released,value}`
records plus new `_prev` / `_prevButtons`) on **every** disconnected poll.

Production now:
1. Marks `_idleClean` after the first zero publish (construction + disconnect).
2. Skips `_resetState` while already idle-clean and still disconnected.
3. Reuses action sample objects / clears maps in place when a real reset runs.
4. Clears `_idleClean` whenever a live pad is present.

Bench-only `setGamepadIdleCleanSkipForBench(false)` restores always-reset for A/B.

## Before / after

### Offline microbench (primary — portable CPU)

Disconnected poll (`navigator.getGamepads() → []`); before = always rebuild;
after = idle-clean skip.

| | Before (always reset) | After (idle-clean) | speedup |
|---|---:|---:|---:|
| cold 40k polls | 14.3 ms | 4.1 ms | **~3.51×** |
| median of 5×40k | — | — | **~23×** |
| `_resetState` calls | 40000 | **0** | — |

Primary (conservative cold): **~3.51×**. Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924t`
(Picture ON, post-#54 tip `d510451c0`+): idle **57.9%**, long tasks **15**;
`_resetState @ gamepad.js` appeared in top src/ self (~66 samples) under
`input.update` / `registry.step`.

### Focused tests

`inf-098-gamepad-reconnect` + `input-lifecycle` + `help-gamepad-rebind` +
`pq-164-00-gamepad-screens` → **21/21** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-input-skip-disconnected-gamepad-action-map-rebu.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/gamepad-idle-clean-skip-microbench.json`
- Tests: `artifacts/focused-tests-gamepad-idle-clean-skip.log`

## Apply order

Independent. Prefer after #54. Stacks under registry.step / input residual.

## Risks

- Idle-clean assumes a disconnected pad stays at the published zero action map.
  A future caller that mutates `gamepad.actions` while disconnected without going
  through `_resetState` would not be refreshed until reconnect — none today.
- Bench-only `setGamepadIdleCleanSkipForBench` must stay default-on in prod.
- `gamepad.js` is CRLF on master — import with `git apply --ignore-space-change` (see IMPORT.md).
