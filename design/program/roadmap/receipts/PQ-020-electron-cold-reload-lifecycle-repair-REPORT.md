<!-- LIFETIME: EVIDENCE -->
<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-020
leafId: PQ-020.electron-cold-reload-lifecycle-repair
acceptance: focused_green
disposition: PASS
candidateCommit: d9a5b1ec019a637ab550d8d8b71c2c8d53f0e441
-->
# PQ-020 Electron cold-reload lifecycle repair report

```yaml
packet: PQ-020
dispatchUnit: PQ-020.electron-cold-reload-lifecycle-repair
candidateBase: d9a5b1ec019a637ab550d8d8b71c2c8d53f0e441
lastRedAcceptanceCandidate: 1c9d317d
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunchedByRepair: false
headedElectronLaunchedByRepair: true
headedElectronPurpose: focused-native-request-provenance-regression
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
- PQ-020 now uses the same application/browser-context issue authority as the accepted Electron
  baseline and end-to-end lanes. It attaches synchronously after `electron.launch()` and before
  `firstWindow`, then binds and backfills the page before canonical route work begins.
- That authority owns the exact expected-navigation token. Requests already active when the token
  begins, or starting while it is live, retain the label through delayed failure delivery. Only an
  exact `net::ERR_ABORTED` on one of those request objects becomes diagnostic.
- Browser keeps its page-scoped collector; Electron no longer asks a late page-only observer to
  reconstruct application request history. Console errors, page errors, crashes, HTTP failures,
  non-abort failures, completed-request failures, and every unscoped abort remain hard failures.
- The PQ-020 broker manifest binds both the application-level regression and the focused native
  provenance check into the candidate digest.

Successive candidate-bound pairs already established that this was an observation defect rather than
a Ceres disagreement: Browser repeatedly passed 21/21; Electron repeatedly completed the same route,
matched normalized facts, and closed cleanly. Candidate `1c9d317d` finally isolated eight varying lazy
module aborts with no attribution. The old PQ-020 observer was created only after initial
`DOMContentLoaded` and listened to one Page, while an Electron renderer's request lifetime begins at
the application/context boundary before `firstWindow`. A start that predates the page collector
cannot receive the reload token later, so its cancellation was necessarily reported as unscoped.

The focused native regression proves the classification without replaying Ceres: New Game → F5 →
reload → Continue at seed `47` produced one real `place_station_trade_hub.glb` request that began in
initial flight and was cancelled during the exact reload. Context and Page reported the same request
identity; the early context authority retained the navigation label, emitted one diagnostic, and
reported zero hard page issues. Restored flight reached registration generation `2/2`, and the owned
Electron process, page, profile listener, and process all closed cleanly. No URL or module-name
allowlist is involved.

## Focused evidence

- Historical native failure: candidate `1c9d317d` produced 21/21 Electron frames, normalized gameplay
  parity, and clean owned shutdown, but eight unattributed module aborts.
- `node test/alpha-live-baseline-electron-contract.test.mjs` — PASS. The regression proves an active
  context request retains its exact navigation label after token close and that an unscoped abort
  remains fatal.
- `node --test test/browser-issues.test.mjs test/pq020-ceres-topology-manifest.test.mjs
  test/ui-screen-registration-lifecycle.test.mjs` — PASS, 19/19.
- `node scripts/check-pq020-electron-request-provenance.mjs` — PASS in one bounded native launch:
  seed `47`, restored flight, registration `2/2`, zero hard issues, one identity-bound expected abort,
  and clean owned teardown.
- `node scripts/check-ui-screen-imports.mjs` — PASS, 41/41.
- `npm run check:pq020:proofs` — PASS, 14/14.
- `npm run check:pq020:ceres-topology` — PASS.
- `node --check` for the changed application issue authority, Electron route, and focused native
  regression — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

The focused native process proves only the repaired lifecycle seam; it does not convert this receipt
into Ceres route or performance evidence. Because the Electron attribution authority and broker
invalidation surface changed, the retained Browser PASS cannot certify the corrected candidate.
`PQ-020.ceres-h1-capture` must spend one fresh broker-owned Browser claim and one distinct Electron
parity attempt. No performance, physical-controller, visual, or H2 verdict is claimed.
