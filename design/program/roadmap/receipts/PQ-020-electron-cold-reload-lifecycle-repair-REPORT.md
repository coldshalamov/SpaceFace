<!-- LIFETIME: EVIDENCE -->
# PQ-020 Electron cold-reload lifecycle repair report

```yaml
packet: PQ-020
dispatchUnit: PQ-020.electron-cold-reload-lifecycle-repair
candidateBase: 5ef49e26
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunchedByRepair: false
headedElectronLaunchedByRepair: false
performanceEvidenceClaimed: false
```

## Recorded failure

Broker candidate `47f2707d` passed the complete Browser route at digest
`ac693a31e60104deff17a55cf6024d92cb8e1859a99b74a15a7bd7a29a4a6f90` on real Intel ANGLE
D3D11. The distinct Electron attempt then produced all 21 declared frames, matched every normalized
Browser gameplay fact, and closed its owned runtime. Its receipt was nevertheless red before parity
because the intentional cold reload recorded:

- one stale `uiRoot.registerScreens()` continuation calling `register` after its screen manager was
  destroyed;
- seven module requests cancelled with `net::ERR_ABORTED` by the explicit `page.reload()`.

The parity diff contained no gameplay disagreement other than Electron's already-red disposition.
This was a mixed product/harness lifecycle failure, not a Ceres route failure.

## Repair

- `uiRoot` now assigns every dynamic screen-registration batch a monotonic owner generation.
  Destroy or re-init invalidates unresolved batches; restoring an old manager reference cannot revive
  them, and a stale batch never registers into a replacement manager.
- `collectPageIssues()` now exposes an explicit expected-navigation token. Only
  `net::ERR_ABORTED` requests that were already in flight when such a token begins, or whose
  `request` event occurs during the exact awaited navigation call, become retained ignored
  diagnostics.
- The PQ-020 route holds that token only around its awaited `page.reload()` call. The window closes
  before root validation, boot, Continue, asset readiness, screenshot, or subsequent input.
- Both Browser and Electron receipts retain ignored cancellations. Console errors, page errors, HTTP
  failures, non-abort request failures, and aborts outside the exact reload window remain hard
  failures.

The first repaired-source recertification exposed a narrower event-order race. Browser passed at
digest `066ba0a50b12ce3357f6bc010e7c14092c5d63085e6ad326d48f137cc38c045c`, while Electron
again completed all 21 frames and matched every gameplay fact but delivered eight old-document
`requestfailed` events just after the awaited reload resolved and the live token closed. The old
collector classified by failure-event time, so those late events became false hard failures.

The collector now records request identity from `request` through `requestfinished` or
`requestfailed`. Starting the expected navigation tags requests already in flight, and a request
whose start event is observed during the exact awaited navigation call receives the same tag. The
request-bound label survives delayed failure delivery after the token closes.

The first identity-bound version was still too narrow: on candidate digest
`e5c4ecf47ec2b0652321e05bae383f22fc7ee313619d2d25ee7e230ca65ce22a`, Browser again passed
21/21 frames with zero issues, while Electron again reached full gameplay parity and closed its
runtime but reported eight different module aborts. Those requests began during the reload call,
not before it. The regression now covers both start orderings and delayed failure delivery. A request
that begins after the reload promise resolves, an abort with no tagged request, a completed request,
or any non-abort failure remains hard. This removes the observed ordering race without adding a time
grace period or weakening diagnostics outside the reload call.

The next candidate digest
`113c356357837da5e9b4f12805315a5a93f9b39c8178e8078b6c4252ea089c51` reproduced the same
functional outcome: Browser passed 21/21 with zero issues; Electron completed 21/21, matched all
gameplay facts, and closed its runtime, but eight aborts remained entirely untagged. The common
property was that Electron attached `collectPageIssues()` only after canonical-root and
`domcontentloaded` waits. Long-lived module requests that started before attachment could later fail,
but the collector had never observed their identity.

Electron now attaches collection immediately after `firstWindow()`, before canonical-root and load
waits, and then backfills request identity from Playwright history. An already-recorded failure is
retired; response headers alone do not mean the body/module request finished. Only the real
`requestfinished` event retires a successful request. A regression creates a request before collector
attachment, gives it a successful response object without a finish event, closes the navigation
token, and only then delivers its abort; the exact request is retained as an expected navigation
cancellation.

Candidate digest `97c8c822f875b41dd276b4c9c4270da11c06037d03a7e4598715eb3ca809d3b0`
again passed Browser 21/21 with zero issues; Electron again completed 21/21, matched every gameplay
fact, and closed cleanly, but eight varying module aborts remained untagged. Early attachment,
history backfill, and response-pending retention therefore did not make object identity survive to
the failure surface. The collector now falls back from exact object identity to a stable Playwright
request fingerprint: method, resource type, URL, and network start time. The fallback is consumed
once. An adversarial regression uses distinct start/failure wrappers for one fingerprint and proves
that a later same-URL request with a different start time remains a hard failure.

Candidate digest `e97b2667ede0798e48ecc90cfd93fd5ae543c884ca97831aa3059fd6f4992891`
showed that Electron does not keep network start time stable across the relevant wrappers either:
Browser passed 21/21 with zero issues; Electron completed 21/21, matched facts, and closed cleanly,
while eight varying aborts remained untagged. The final fallback uses method, resource type, and URL
only while that route is unambiguous. Observing a same-route request after the navigation window
invalidates the fallback before failure, so an unrelated later request cannot inherit the old
navigation label.

## Focused evidence

- Recorded native failure: 21/21 Electron frames, normalized gameplay projection equal to Browser,
  owned runtime closed, but one stale registration error plus seven reload-aborted requests.
- `node --test test/ui-screen-registration-lifecycle.test.mjs test/browser-issues.test.mjs
  test/pq020-ceres-topology-manifest.test.mjs` — PASS, 20/20.
- The issue regression explicitly delivers the tagged request failure after the expected-navigation
  token closes, matching the observed Electron ordering; it covers both pre-existing and
  during-navigation request starts, and rejects post-navigation, untagged, completed, and non-abort
  failures.
- `node scripts/check-ui-screen-imports.mjs` — PASS, 41/41.
- `npm run check:pq020:proofs` — PASS, 14/14.
- `node --check` for the changed UI, issue-collector, and route modules — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

The headed processes described above belong to the claimed `PQ-020.ceres-h1-capture` unit and are
recorded here only because they revealed the delayed-event defect; they do not convert this repair
receipt into route or performance evidence. The issue-attribution source changed again, so the
Browser PASS cannot certify the corrected candidate. `PQ-020.ceres-h1-capture` must spend one fresh
broker-owned Browser claim and one distinct Electron parity attempt. No performance, physical
controller, visual, or human verdict is claimed.
