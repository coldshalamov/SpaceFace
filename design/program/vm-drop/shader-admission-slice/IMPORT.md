# IMPORT — shader-admission-slice (PERF backlog #24 + #27 + #29 + first-draw gap)

## What it is

A patch series that lands four related first-draw / in-flight admission fixes from
`design/perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md`:

1. **#24 Time-slice in-flight admission** — after first playable, new ships and promoted
   rocks compile via `yieldAfterPresent` (same after-present lane loading already uses)
   instead of stacking `compileObjectPipelines` on the mesh-build drain turn.
2. **#27 `scheduler.yield()` after present** — `armCallbackAfterPresent`,
   `yieldToNextPresent`, and pipeline resume prefer `scheduler.yield()` after rAF instead
   of stacked `setTimeout(0)` (postTask background remains next-best; setTimeout is the
   headless fallback).
3. **#29 Player-route shader log checks stay off** — confirmed via
   `installShaderLinkReporter` (no inline `checkShaderErrors = false` in `renderer.js`,
   which would trip the compileAsync isReady crash guarded by
   `pipeline-auto-flush-policy`).
4. **First-draw gap** — `createOpeningSubmissionReceipt` unions a live plan resource walk
   into `before`, and the pre-submit extras path recaptures once before `extrasOnly`
   fail-open, so `uncaptured-first-draw-resource` no longer forces the failsafe-open gate
   when the resources are already resident.

## How to apply

From a clean master tip (or a throwaway import branch cut from master):

```bash
git fetch origin
git checkout -B import/shader-admission-slice origin/master
git am design/program/vm-drop/shader-admission-slice/patches/*.patch
npm run check:shader-admission-slice
npm run check:baseline -- --json   # expect no worse than baseline-before.md
```

To abort a bad apply: `git am --abort`.

## PERF backlog items claimed

- **#24** Time-slice in-flight admission (new ships and promoted rocks).
- **#27** Schedule background admission with `scheduler.yield()` after present.
- **#29** Keep three's per-program shader log checks off on the player route.
- **First-draw gap** Close the uncaptured-first-draw-resource path that forced failsafe-open.

Does **not** claim dummy shader / catalog prewarm (closed by PERF_WHAT_MATTERS). Does not
touch bloom/shadows/picture defaults.

## Context numbers (Phase A / quiet-witness)

- boot-stage-profile @ `0612d2b9f` (soft-GPU): cold boot → first control **24.03 / 26.1 / 22.91 s**;
  longest stage every run `loading:entering-flight → first-playable` (**8540 / 7746 / 7315 ms**).
- quiet-witness-baseline: first visible draw identity gate **fail (uncaptured none / textures)**
  on all three — the gap this series closes in the census/fail-open path.
- Label any GPU fps / absolute GPU timings as **soft-GPU**; owner-verify on Intel/ANGLE.

## What this does **not** wire

- Does not merge to master (importer decides).
- Does not add a second admission pipeline — finishes existing compilePresent /
  pipelineReadiness / openingSubmission paths.
- Does not change picture defaults (bloom/shadows stay on).
- Does not invent dummy shader prewarm.
