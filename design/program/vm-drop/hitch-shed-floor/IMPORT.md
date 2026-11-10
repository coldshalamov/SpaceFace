# IMPORT — hitch-shed-floor

## What it is

Raise `HITCH_FRAME_TICKS` from **4.5 → 6.5** (~75 ms → ~108 ms) so a sustained soft-GPU
~10–12 fps frame rate stays on the slow path (full `MAX_CATCHUP_STEPS = 4`) instead of
being hitch-capped to two ticks every callback. True spikes (120 ms+) still shed.

Picture contract untouched. No quality / bloom / particle cuts. No present-order change.

## How to apply

```bash
git fetch origin
git checkout -B import/hitch-shed-floor origin/master
git am design/program/vm-drop/hitch-shed-floor/patches/*.patch
node --test test/simulation-runner.test.mjs test/presentation-continuity.test.mjs test/hitch-classifier.test.mjs
```

To abort: `git am --abort`.

## Apply order

Applies cleanly on bare `origin/master` (`0612d2b9f` measured). No prior outbox required.

## Related

Open PR #159 (`perf/lane-d-present-first`) carries the same threshold change stacked on
Lane C wave-wasp work. This outbox is the **solo** hitch-floor package for importers who
want the measured hitch win without the Lane C stack.
