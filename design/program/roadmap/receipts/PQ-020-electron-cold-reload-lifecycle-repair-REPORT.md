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
  `net::ERR_ABORTED` requests that were already in flight when such a token begins become retained
  ignored diagnostics.
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
`requestfailed`. Starting the expected navigation tags only requests already in flight; their later
`net::ERR_ABORTED` event retains the navigation label even after the token closes. A new-page request
that starts inside the bracket, an abort with no tagged request, a completed request, or any
non-abort failure remains hard. This removes the Electron event-delivery race without adding a time
grace period or weakening other diagnostics.

## Focused evidence

- Recorded native failure: 21/21 Electron frames, normalized gameplay projection equal to Browser,
  owned runtime closed, but one stale registration error plus seven reload-aborted requests.
- `node --test test/ui-screen-registration-lifecycle.test.mjs test/browser-issues.test.mjs
  test/pq020-ceres-topology-manifest.test.mjs` — PASS, 18/18.
- The issue regression explicitly delivers the tagged request failure after the expected-navigation
  token closes, matching the observed Electron ordering; it also rejects new-page, untagged,
  completed, and non-abort failures.
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
