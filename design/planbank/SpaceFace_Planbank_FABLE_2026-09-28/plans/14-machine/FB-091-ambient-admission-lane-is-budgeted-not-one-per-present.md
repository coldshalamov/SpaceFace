# FB-091 — Sector-arrival pop-in drains by time budget, not one root per present

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: liveGeometryAdmission.js, seam: renderer.js, seam: decodeTaskBudget.js
**Write-set:** `src/render/liveGeometryAdmission.js`, `src/render/renderer.js`, `src/render/decodeTaskBudget.js`, `src/render/admissionSliceBudget.js`, `test/fb-ambient-admission-width.test.mjs`
**Neighbours (extend, never restate):** SFQ-B212, NXB-060

## The gap
`createLiveGeometryAdmissionQueue` drains exactly one ambient root per present, and `kickDecodeRunwayAssets`
in `src/render/renderer.js` keeps at most two concurrent decodes regardless of core count. Five renderer
comments name the same serial slot as the reason a convoy's compile tail strands for dozens of presents.
Meanwhile `resolveDecodeTaskBudgetLimit` already computes a real concurrency from `hardwareConcurrency` and is
not used here.

## Why this direction
Widening blindly would blow the frame; the existing `admissionSliceBudget.js` is time-bounded
(`ADMISSION_SLICE_TARGET_MS` 3 / hard 8), so draining "as many ambient roots as fit in the slice" cannot
regress the longest frame. Decode concurrency should come from the budget helper that already exists rather
than a literal 2.

## Mechanism
- Let the ambient lane drain roots until the slice budget is spent (reuse `normalizeAdmissionSliceOptions`),
  keeping the urgent lane's merged pass unchanged.
- Route decode concurrency through `resolveDecodeTaskBudgetLimit(navigator.hardwareConcurrency)` in
  `kickDecodeRunwayAssets`, floor 2, cap by the same budget.
- Keep the on-glass protection contract: no evicted or pending on-glass mesh may be disposed during the wider
  drain (`diagnostics.onGlassDisposals` must stay 0).

## Done when
`node scripts/probe-frame-solid.mjs --compare=<baseline .json>` on the Ceres arrival: time-to-appear for the
arrival cohort drops with no increase in longest frame; `onGlassDisposals` stays 0;
`test/fb-ambient-admission-width.test.mjs` pins that the lane stops at the slice budget on a synthetic 40-root
queue.

## Do not
Do not lower default quality or drop authored visuals to hit the number. Do not touch the opening cohort path
(`openingGpuAdmission.js`), which already pools link waits. Do not spawn a worker.

## Focus test starting points
- `test/admission-slice-budget.test.mjs`
- `test/decode-runway-pick.test.mjs`
- `test/authored-admission-recovery.test.mjs`
