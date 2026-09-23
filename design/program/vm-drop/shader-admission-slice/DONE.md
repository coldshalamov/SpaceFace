# DONE — shader-admission-slice

## Summary

Backlog **#24 + #27 + #29** plus the first-draw identity-gate gap. Patch series ready to import.

| Item | What moved off the glass / first-draw path |
|---|---|
| **#24** | In-flight admission for **new ships and promoted rocks** now goes through `yieldAfterPresent` after first playable (same time-sliced after-present lane loading already uses), instead of stacking `compileObjectPipelines` on the mesh-build drain turn. |
| **#27** | Background admission resume uses **`scheduler.yield()` after present** (`armCallbackAfterPresent`, `yieldToNextPresent`, pipeline resume). No more stacked `setTimeout(0)` when yield exists; postTask(background) is next-best; setTimeout remains headless fallback. |
| **#29** | Player route keeps three's per-program shader log checks off via `installShaderLinkReporter` (no illegal inline `checkShaderErrors = false` in `renderer.js`). Focused test pins the contract. |
| **First-draw gap** | `createOpeningSubmissionReceipt` unions a **live plan resource walk** into `before`; pre-submit extras path **recaptures once** before `extrasOnly` fail-open. Closes the `uncaptured-first-draw-resource` path that forced the failsafe-open submission gate (quiet-witness / boot-stage note). |

Focused tests: `npm run check:shader-admission-slice` → **49/49 pass** (log in `focused-tests.log`).

## Before / after baseline

| | ok | failed | wallMs | notes |
|---|---|---|---|---|
| before (untouched master `0612d2b9f`) | false | save-schema, sim-compare, sim-v3, sim | 39658 | known soft-GPU noise |
| after (scratch with patches) | false | save-schema, sim-compare, sim-v3, sim | 35651 | **same four**; no new reds |

See `baseline-before.md` / `baseline-after.md` and the JSON receipts.

## Soft-GPU / Phase A context

This VM is soft-GPU (SwiftShader/llvmpipe). Label any fps / absolute GPU timings as soft-GPU; owner-verify on Intel/ANGLE.

Phase A citations:
- **boot-stage-profile** @ `0612d2b9f`: cold boot → first control **24.03 / 26.1 / 22.91 s**; longest stage `loading:entering-flight → first-playable` (**8540 / 7746 / 7315 ms**).
- **quiet-witness-baseline**: first visible draw identity gate **fail** (uncaptured none/textures) on all three — the census/fail-open gap this series closes.

## Evidence

- Patches: `patches/0001` … `0004`
- Focused tests: `test/shader-admission-slice.test.mjs` + flight-present / compile-present / shader-link / opening-submission / admission-slice / pipeline-auto-flush (**49 pass**)
- npm script: `check:shader-admission-slice`
- Scratch branch kept **local only** (not pushed): `vm-work/shader-admission-slice` @ `c5de6ab2c16e903abc0b8f8f11162e70674fce0e16e903abc0b8f8f11162e70674fce0e`

## Risks for the importer

- Live first-draw identity gate still needs an owner-GPU quiet-witness pass to confirm the soft-GPU texture gap is gone on Intel/ANGLE.
- `scheduler.yield()` / `postTask` availability varies by browser; setTimeout fallback remains.
- Picture contract untouched: no bloom/shadow/quality cuts; no dummy shader prewarm.
