# IMPORT — event-trace-thrust-sanitize

## What it is

Every powered flight frame emits `ship:thrust` into the always-on deterministic
event trace. `sanitizePayload` walked `Object.keys(...).sort()` for that
envelope (and each nozzle). Production now uses a **typed fast path** that
writes the same alphabetical JSON key order for the flightV3 shape; unknown
shapes fall back to the legacy sanitizer. Bench-only
`setThrustTraceSanitizeFastForBench(false)` restores always-legacy for A/B.

## How to apply

```bash
git fetch origin
git checkout -B import/event-trace-thrust-sanitize origin/master
git am design/program/vm-drop/event-trace-thrust-sanitize/patches/*.patch
node artifacts/event-trace-thrust-sanitize-microbench.mjs
# from a worktree that has the artifact script, or:
node design/program/vm-drop/event-trace-thrust-sanitize/artifacts/event-trace-thrust-sanitize-microbench.mjs
node --test test/governor-weave.test.mjs test/vfx-settings-runtime-truth.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #57. Stacks under registry.step / eventTrace residual.
