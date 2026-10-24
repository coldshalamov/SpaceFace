<!-- LIFETIME: DURABLE -->
# Mobile boot touch identity

20 October 2026. Scoped actor correction; mobile gameplay acceptance remains open.

## Observed defect and limits

PR471 head `9cbb68b9eb642b699545d22643605f1963ff0ff0` repairs stale fixture tests.
Its Chromium mobile CI reaches the real browser but ends on the Codex Archive, not
an empty UI. It has no boot-click receipts, so the exact historical tap that opened
Archive is not established. WebKit's separate pre-menu page crash is not explained
by this change.

The actor's raw touch has a reproducible identity race: it reads the intended
control's bounding box and later sends coordinates without checking their current
hit target. The real cinematic finalizer adds `is-closing`, shows the menu, and
keeps the cinematic node for another 700ms. The authored closing CSS sets
`pointer-events:none`, while visibility/bounds alone still pass. A timer transition
between the box read and dispatch can therefore send a stale tap to an unrelated
menu action beneath it. The deterministic API replay executes the actual probe
function and actual cinematic finalizer. Before correction, its simulated hit
plane receives Archive; this is a unit reproduction, not a new browser capture or
proof of which event caused the historical CI failure.

## Correction

- Use the locator's native trusted `tap` action, without `force`, rather than raw
  touchscreen coordinates. Shipped Playwright 1.61.1 retains visible/enabled/stable
  checks and its hit-target interceptor, including movement/detachment retries.
- The 390px phone menu explicitly does not construct the moving ORRERY arc rail.
  Cinematic Begin has a finite entry translation, then an opacity-only pulse, not
  perpetual bounding-box motion. No app animation, input, screen or CSS changed.
- Boot taps consume at most the remaining original 180000ms menu budget and retain
  the existing 20000ms per-action maximum. Clamp to at least 1ms because Playwright's
  zero timeout disables the bound. An auto-dismissed cinematic can time out its
  tap and transition to the ready menu on the next observation; it does not fail
  New Game by itself or restart the budget.
- Existing 300000ms flight/Continue, trusted-click, renderer and worker gates remain
  unchanged. No hidden state mutation, storage injection, synthetic click,
  forced actionability, route workaround, deployment or workflow change.

## Verification

Seven added actor contracts cover actual cinematic finalization, detachment,
movement, disabled controls, target-bound timeout forwarding, normal disappearing
intro transition, and remaining-menu-budget enforcement. The seven original red
results and subsequent outputs are preserved with the recovery packet.

Focused startup tests 27/27 pass, preserving PR471's existing 20 cases. These cases
are in the already-selected startup test, so no CI/package registration is needed.
Exact public predecessor mobile-glob tests pass 140/140; the proposal passes
147/147. Parent independent focused review passes 27/27. The exact public workflow
12-file selection ends at 128 passed, one failed and two cancelled out of 131:
three paused-worker save variants did not finish under the unchanged 30-second
test bound in this validation environment. This remains unresolved, not labeled a
public baseline defect; actual CI must decide it without a budget change. All
repository module, sync/async file and esbuild read identities are verified.
Recovery identities are recorded in the final validation receipt. The validation adapter is not shipping code: repository
imports, sync/async file reads, and esbuild inputs come from one selected Git tree;
installed third-party packages are the only disk-source exception.

A canonical all-mobile glob initially yielded 146/147 with a VM structuredClone
error in the presentation-bundle test. A canonical workflow selection yielded
127/131 because four GLB tests cannot find an asset in this sparse checkout. Neither
is promoted to a public-baseline defect. Public-tree checks must classify them
against actual Git contents rather than mixing unpublished local source or absent
working-tree assets into the proposal. No runtime/browser success is claimed here.

## Ownership and next action

Owned paths: scripts/probe-deployed-mobile.mjs,
test/mobile-probe-startup.test.mjs, and this handoff. Proposal is a successor of
PR471's exact public head, preserving its fixture changes and public ancestry.
Review, preserve, publish as a separate draft, then follow exact-head mobile CI.
Do not merge or deploy. SF-GAME, SF-VISUALS and physical-phone D188 stay open.
