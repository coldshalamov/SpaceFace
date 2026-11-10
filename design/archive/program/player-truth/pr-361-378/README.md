# Remaining PR integration and performance

Reviewed and improved PRs #361, #362, #363, #367, #371, #374, #376, #377 and #378, then the arriving #379 and #380 increments. The original seven-PR batch was already landed in `68ace4033d`. Recent LOD, quality-mode, worker snapshot and worker projectile presentation work is preserved in this integration.

## Implemented performance changes

- Presented-width projection now skips entities without a LOD consumer and ships whose authored detail is pinned. A mixed 100-entity fixture reduces projection calls from 100 to 20 and FOV reads from 200 to 40; actual prop LOD width and culling behavior remain unchanged.
- Counterplay restores normalized history once per owned memory lifetime. An 80-tick fixture reduces history clones from 80 to 1 with identical decisions; save replacement and occupant generation changes invalidate the cache. Reaction-delay lookup no longer allocates a filtered history array.
- Optional late Foundry HDRI work runs behind the loading veil after the reply task, with cancellation and stale-owner checks. This preserves the authored environment and default quality; a cheaper bake or target-host loading-time gain was not measured.
- Moment Machine capture uses a byte view instead of a second full clip copy. Player-truth stores numeric entity rows in shared per-frame buffers and streams backpressured gzip output, avoiding a whole-trace JSON string. The trace fixture preserves every field and verdict; a 650,000-row fixture lowered V8 heap from 130.3 to 104.4 MB while moving storage to external buffers. This is not a total-process RAM reduction claim.
- The asset bank contains 156 structurally validated candidates / 468 GLBs / 196,921,332 bytes. It adds no automatic world spawns or runtime loader. Assembly recipes and review receipts remain tooling; live visual acceptance, moving-part clearance and runtime assembly performance were not measured.
- Inactive prewarmed screens are hidden before mount can yield. The additional style write occurs once per newly built inactive screen, outside the frame loop.

## Native route evidence

These runs use the public game route and Intel D3D11 Chromium. The checked-out source was shared with other active work; each verdict records its start/end revision and dirty paths. The copied receipts retain their original provenance and raw-output locations.

| Mode / pass | Measured gameplay checks | Remaining acceptance |
|---|---|---|
| [Adventure](adventure/verdict.md) · [contact sheet](adventure/contact-sheet.jpg) | Core checks pass | Visual sampling, offscreen markers and quiet-host frame timing incomplete |
| [Swarm idle](swarm-idle/verdict.md) · [contact sheet](swarm-idle/contact-sheet.jpg) | Core checks pass; no passive kill/reward | Visual sampling and quiet-host frame timing incomplete |
| [Swarm active](swarm-active/verdict.md) · [contact sheet](swarm-active/contact-sheet.jpg) | Core checks pass; three rounds reached | Enemy silhouette ownership and quiet-host frame timing incomplete |
| [Gauntlet idle](gauntlet-idle/verdict.md) · [contact sheet](gauntlet-idle/contact-sheet.jpg) | Core checks pass | Unplayed round transitions, visual sampling and quiet-host frame timing incomplete |
| [Gauntlet active](gauntlet-active/verdict.md) · [contact sheet](gauntlet-active/contact-sheet.jpg) | All measured gameplay checks pass; three rounds cleared, six control probes pass, no passive kill/reward, no broken round starts or popping | Enemy silhouette ownership and quiet-host frame timing incomplete |
| [Racing](racing/verdict.md) · [contact sheet](racing/contact-sheet.jpg) | Core checks pass; trace and verdict written without OOM | Shorter course/window than the original failing capture; visual sampling and quiet-host frame timing incomplete |

All final verdicts are **INCOMPLETE**, not complete visual or performance acceptance. The Gauntlet active run records diagnostic p50 42 ms / p99 188 ms with observer readbacks included. This contended development host cannot establish smooth target-hardware frame pacing.

## Repairs from failed checks

Earlier Gauntlet attempts failed to reach round 3. The public fighter now cuts and confirms its tether before steering or aiming, and releases short yaw taps before observer RPCs can extend a held turn. Another run was capped while its owned Windows Chrome window was minimized; the harness now restores only that page's minimized window, with lifecycle cleanup and no resize or focus command. The final seed-4242 Hornet run clears rounds in 67.1, 85.0 and 73.4 sim seconds. No game difficulty, loadout, seed, invulnerability or round-count requirement was weakened. Earlier raw failures remain in `.devshots/remaining-prs-gauntlet-unoccluded`, `remaining-prs-gauntlet-cut-repaired` and `remaining-prs-gauntlet-yaw-repaired`.

The first Racing capture exhausted Node's V8 heap. Numeric packing and streamed serialization were then checked for schema/verdict parity, and a native Racing run wrote its verdict and trace. That later run used a different, shorter daily course and a minimized window; it does not recertify the original full-size course or establish whole-process memory savings.

## Other direct checks

Focused recovery, capture, doctrine, economy, loading, browser-loss, trace-memory, window-lifecycle and UI-control checks pass. Asset planner, composition and validator fixtures pass, including rejection of malformed sidecars and an evidence-only empty bank. #379's latest CI-only increment passes its 84 supplied tests; #380's five mount/prewarm cases pass. UI walks exercise the changed screens and preserve the restored handling/heat text; the live bench uses the production screen-memory context so Dismiss updates the real guidance state. Shipping-bundle and generated-preload checks pass; the additional asset bank is excluded from the game release.
