# IMPORT — opening-residency-deadline

## What it is

Once soft-GPU opening plans complete, `prepareStartupGpuResidency` could still
burn >1 s of sync `initTexture` work past the outer `Promise.race(750ms)` budget
(timer starved). Pass `deadlineMs` into the uploader and **continue** to
post/receipt on partial uploads so the identity freeze still lands.

## How to apply

```bash
git fetch origin
git checkout -B import/opening-residency-deadline origin/master
git am design/program/vm-drop/opening-plan-complete/patches/*.patch
git am design/program/vm-drop/hitch-opening-drain/patches/*.patch
git am design/program/vm-drop/opening-residency-deadline/patches/*.patch
node --test test/opening-residency-deadline.test.mjs \
  test/opening-soft-gpu-drain-skip.test.mjs \
  test/opening-plan-awaiting-authored-skip.test.mjs
```

## Apply order / deps

**Requires** opening-plan-complete + hitch-opening-drain first (this patch targets
the residency block those introduce). Does not apply cleanly on bare master alone.

## Picture defaults

Untouched.
