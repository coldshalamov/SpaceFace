# Narrow preview physical-lifetime delta review

Scope: only the new Pip preview program-settlement and teardown delta, its two renderer-double tests, and the shared runtime API whose physical-retirement guarantee the delta relies on. No new general gameplay/UI review.

Preview source SHA256: `a425d55883fc5570cfae6b6d3716b6338f148cf56d09e114cf602e9b52961e0f`
UI-test source SHA256: `0719d6f7d8e5e7821b79f1bbfe70d7de5030355ed9db016113d0d22ef369c9ef`

## Verdict

The GPU-program readiness delta passes bounded source/test review. Reusing `retireWhenProgramsReady` with `maxWaitMs: Infinity` prevents the 8s/20s logical deadlines from retiring known still-linking programs. Publication and withdrawal use the same lifetime owner; disposal is idempotent, logically withdraws immediately, and keeps renderer/material ownership through the deferred program-settlement path. Existing lost-context checks still prevent promotion of a lost canvas. The 13-test UI file, including both new linked/context-lost retirement tests, passes (`preview-lifetime-delta-tests.log`).

**The physical decoder-retirement claim is not established and a real shared-owner timeout counterexample fails.** This is a dependency issue in the existing asset-loader owner, not a request for a second preview loader or timer.

## Confirmed counterexample

`src/render/assetLoader.js:150-155` stores `admission.wait(work)` as the tracked task. `src/render/asyncAdmission.js:1,80-114` rejects that logical task at the 120,000ms deadline without waiting for the underlying physical promise. `src/render/assetLoader.js:198-213` awaits these logical pending tasks before disposing decoders. Consequently, `disposeAuthoredAssetRuntime` can resolve before the physical parse finishes, and the new preview teardown then releases its lease and renderer/context.

`preview-decoder-retirement.test.mjs` composes the actual exported `admitAuthoredAssetTask` and `retireAuthoredAssetRuntime` with the actual new `retirePitPreviewResources` helper. It supplies one deferred parse and advances mocked timeout time. No GPU/browser is involved.

Observed after 120001ms, before resolving the parse:

- physicalSettled: false
- disposal events: decoder, lease, renderer, context

Expected: no disposal events until physical parse completion or confirmed physical cancellation/worker retirement. The regression is intentionally red in `preview-decoder-retirement.log`.

The maker's injected `disposeRuntime` tests are useful ordering evidence, but a manually deferred decoder promise cannot certify the actual owner's guarantee. Root should fix/verify physical settlement tracking in the shared owner or retain this exact limit when sealing. Prior behavior/consumer findings and their bounded verdict remain unchanged; this addendum qualifies only the newly requested physical-lifetime claim.
