# Mobile Continue admission: serial touch pacing

2026-10-20, owner: repair_mobile_continue_admission. SF-GAME, SF-PUBLISH,
SF-RECOVER, SF-VISUALS remain open. No visual or mobile acceptance is claimed.

## Actual browser evidence

PR472 at `3f69d6b0eafadaec617ead30cd6df5909f4c0ff0`, Chromium CI
run39483342067: New Game, touch controls, save, renderer health and worker
contract pass. The reload uses landscape844x390, with the saved simulation
tick237. Continue fails at19:30:29Z with GPU_RESIDENCY_UNAVAILABLE and
`mobile opening first-picture admission timed out` in prepareLiveSectorBeforeFlight.
No context loss or renderer error was reported. Loading receipts progress
48/366,221/413,281/413,341/413 before failure. Portrait New Game finished with
309 resources. These are accumulated work receipts, not a proven exact draw
census. The report does not expose the inner stalled phase; this change does
not claim the full timeout cause or attribute the count difference to optional
assets. WebKit's separate pre-menu crash and overlapping mobile HUD remain open.

## Proven redundant work

The serial GPU submit reservation already yields a task/present and drains GL
before its promise resolves. The opening admission touch loop then yields again,
with no intervening GPU submission. Three subjects reproduce six legitimate
compile/touch drains plus two unnecessary post-touch yields. The regression
fails against the predecessor (2 != 0) and passes with this change.

Skip only the extra touch yield when batch.submit is exactly paceQueue.submit,
or the legacy paceQueue.submit fallback is selected. Generic custom submitters,
KHR/parallel callers, issue pacing, texture/geometry reattachment, strict checks,
all resource identities and all deadlines retain their existing behavior.
Grouped touches follow the same rule. Cancellation/context loss still refuse
later submissions, and attempted work still drains before reservation release.

## Validation and next action

Canonical initial focused admission/mobile/loading tests:76/76. Serial ownership,
urgent admission and cook debt tests:19/19. After adding custom-submit-with-pacer
coverage, exact public candidate96/96 across all seven suites; all module/fs read
identities verified against the immutable proposal. Final handoff-only evidence
update does not alter the tested source/test blobs. Tests use the real GPU reservation
and deterministic scheduled callbacks, not a GPU or browser rendering claim.

Review the exact public-tree proposal against PR472; publish only after review,
then follow real Chromium Continue and WebKit CI. Keep the20s mobile ceiling and
all acceptance gates unchanged. If Continue still fails, retain this independently
proven redundant-work correction and diagnose the new exact evidence. Do not
claim the game finished, the world visible, or mobile readiness accepted.
