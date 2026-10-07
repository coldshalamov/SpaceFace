<!-- LIFETIME: HISTORICAL -->
# Mobile readiness investigation and acceptance record

PR: https://github.com/coldshalamov/SpaceFace/pull/226
Runtime revision: `37e1bc428b94680ab900cab827eeaca4f0a13313`.
This is evidence for that revision, not an assertion that the mobile campaign is complete.

## Result: retain the draft until WebKit launch is resolved

The real-asset acceptance run is
https://github.com/coldshalamov/SpaceFace/actions/runs/37565474622.
Both engines passed 66 targeted tests, the full retail build and receipt checks, and
real browser round trips through the shipped digest and GLB-prepass workers.
The output dependency check resolved 98 motion-bank references across 286 render
packages to 69 distinct shipped JSON banks, with byte/hash/rig/schema verification.

Chromium phone-profile acceptance passed: fresh menu, New Game, unobstructed flight,
visible fire/tether/powers/pause controls, power-wheel open/close, pause/resume and
landscape rotation without clipping the tested controls. It captured a 13.531-second
launch on that runner. This is neither an iPhone performance result nor a controlled
speedup comparison. No unhandled page error or critical asset HTTP failure was recorded.

WebKit phone-profile acceptance failed when the page/context/browser closed during
New Game. Its last recorded progress was GPU-resource preparation, at 675 of 880
resources in that pass. Mobile detection was active; no JavaScript page error or
missing worker/model/motion-bank response was captured before failure. The report
alone does not establish memory exhaustion, a graphics-driver fault, or an iOS bug.
The static host returned 404 for the optional shared-player-store probe in both
engines; Chromium completed anyway. Cancelled cinematic requests were also logged.
Do not describe the WebKit run as a pass, or the full campaign as iPhone-ready.

## Confirmed repairs

Original public-deployment evidence:
https://github.com/coldshalamov/SpaceFace/actions/runs/37561196090.
Both URL-created asset-processing workers were absent from the retail output. They
are now emitted explicitly in their actual classic/module formats, self-contained,
under `workers/`, before the hash receipt is sealed. Runtime URLs distinguish raw
modules from document-relative split production bundles and path-prefixed hosting.

Subsequent real retail and Vercel preview acceptance exposed missing
`assets/ships/motions/*.motion.json`. Those are hash-pinned runtime dependencies of
animated render packages, not optional authoring files. Include only their canonical
small subtree in the exact-copy/receipt contract. Do not restore gigabytes of source
model fallbacks. The new output dependency check catches missing or swapped banks.
Hosted evidence: https://github.com/coldshalamov/SpaceFace/actions/runs/37564474460.

Touch detection now accepts coarse Touch Events hosts with zero `maxTouchPoints`
and can discover an actual touch when capability hints are incomplete. It respects
explicit opt-out and cleans up listeners. The baseline WebKit screenshot previously
showed the desktop HUD after the loading overlay cleared.

Worker lifetime changes separate queue waiting from execution deadlines, cancel
queued leases, release late grants, return owned bytes on queue expiry, instantiate
workers on demand and terminate silent/unreadable digest workers. Asset integrity,
scene-graph fidelity, physics and authored models are unchanged.

`vercel.json` selects the existing static retail output, skips unused installer
binaries and revalidates stable worker/entry URLs. No paid-plan change, function,
authentication bypass, production promotion or merge was performed. Vercel project
reads work in the connector's default scope; an explicit incorrect team scope had
initially produced permission errors.

## Reproduction and remaining release gates

Run `mobile-readiness` against a complete checkout, or run the targeted tests and
`scripts/check-bundle.mjs`, then `scripts/check-retail-motion-banks.mjs`. Serve
`build/web` statically and run both `check-runtime-worker-browser.mjs` and
`probe-deployed-mobile.mjs` with `MOBILE_PROBE_ENGINE=webkit` and `chromium`.
The acceptance script navigates the real route and uses touch events; it does not
inject player state or substitute game assets. The separate blank-page worker
fixture is a worker test only, never evidence of game playability.

For hosted checks, manually dispatch `mobile-preview-acceptance` with the immutable
URL of a completed deployment containing the intended runtime revision. It no longer
silently defaults to an obsolete preview. Diagnostic follow-up captures browser
process output, page lifecycle events, error stacks and the last launch state; it
persists evidence before shutdown. The official Vercel skip-toolbar request header
excludes preview feedback UI only, not deployment protection or game code.

The next release-blocking investigation is the WebKit process exit during resource
preparation in `src/core/newGameStartTransition.js`, `src/main.js` and the renderer.
Correlate browser stderr/process exit and host memory with the last prepared resource.
Distinguish OS termination, WebGL context loss and test-host driver failure before
changing budgets. Preserve authored fidelity; do not hide the failure by skipping
the readiness gate, extending timeouts, or replacing models. Re-run the same fresh
route, then confirm on physical iPhone hardware, recording model/iOS/commit/network.

Remaining physical-device gates include simultaneous steering/boost/fire, tether
and power activation, touch cancellation, docking/map/settings, safe areas, repeated
launches, background/foreground, WebGL context loss and sustained combat. The passing
Chromium UI route does not certify those unexecuted cases or physical-device memory.
