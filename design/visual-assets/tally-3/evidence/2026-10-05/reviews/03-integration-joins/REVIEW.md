# Tally integration joins: bounded independent review

Reviewed 2026-10-05 at 03:17 UTC. Result: corrected joins reviewed successfully; no remaining blocker in this bounded scope. No production/shared files were changed by this review.

## Reviewed changes

- `src/render/authoredMotion.js`: Tally-specific driver creation, state update before controller evaluation, disposal, and retirement guards for retained update/event callbacks
- `tools/blender/forge/fleet.json`: one additive Tally place registration; all pre-existing bytes are preserved outside the insertion
- `scripts/model-truth-census.mjs`: strict source-spine dispatch, an explicitly red/source-only row, and full-precision collider evidence restored after the global formatting pass
- `tools/blender/forge/publish.mjs` plus `publicationPolicy.mjs`: preserve existing explicit `dynamicNameIncludes` arrays rather than replacing authored motion tokens with defaults
- `test/forge-publication-dynamic-groups.test.mjs`: explicit groups, empty arrays, repeated publication, missing values, and flight-static override

The four modified existing files were compared with their exact preimages in `../preimages/`. `reviewed-files.sha256` pins all six reviewed candidate files.

## Correction found during review

The initial census join called the strict Tally classifier after the generic asteroid early return. A Tally-identified row with an incorrect `fit: 'asteroid'` therefore bypassed the dedicated fail-closed identity gate. `census-dispatch-initial.tap` reproduces this by evaluating the exact existing `measureRow` function with a sentinel at the first generic asteroid operation.

The maker moved `tally3SpineMeasurement(row)` to function entry, before either proportions resolution or generic fit branches. The same test now rejects the wrong identity while an ordinary asteroid still reaches its original branch. No generic all-visible compound-box measurement was relaxed, removed, or converted to the Tally source-only exemption.

## Verification

`join-adversarial-final.tap`: 6/6 independent assertions passed:

1. Incorrect Tally asteroid fit is rejected by the strict identity gate
2. Ordinary asteroid dispatch remains unchanged
3. Fleet JSON is semantically exactly additive
4. Composite state is selected before same-call controller evaluation using the production three-argument consumer shape
5. The real motion bank strokes the stamp on its first visible evaluation after the public accepted settlement, and returns to rest for a dead actor
6. Detached retained update and event callbacks are inert; late predecessor teardown preserves the successor callback and registration

`neighbor-regression-final.tap`: 43/43 passed across the existing authored-motion suite, the publisher-policy tests, and selected-census append tests. Existing other-family motion/event behavior remains covered by that suite.

`census-evidence-verification.json`: independently checked the maker's actual emitted `../evidence/tally3-source-only-census.json` against fresh `measureTally3SpineSource` output. The entire embedded evidence and native hull match exactly. The row remains red with `source-spine-only-release-chain-unverified`; its URL is the source GLB; `proposedSkin` is null. Both the top-level collider and embedded tolerance remain `0.00001`, and gap remains `6.073788898635482e-7`, rather than being rounded to zero by global `stable()`. The preservation step only restores the Tally collider with genuine source evidence; all other rows retain the original global formatter.

The publisher delegates only the dynamic-name selection to the small helper. Explicit arrays, including empty arrays, are retained. Missing or non-array declarations retain historical generic-hook defaults. Flight-static packages still force an empty array. Manifest, release, package-build and census command sequencing is unchanged.

## Boundaries

This review does not publish, rebuild or approve root-owned canonical manifests, compressed releases, render-package outputs, or final shipping-consumer acceptance. It does not reopen gameplay, art, native geometry, the prior motion-state lease review, or quiet-host performance. Source-spine census evidence remains deliberately source-only and red, even if release/package generation occurs elsewhere.
