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
- `collectPageIssues()` exposes an explicit expected-transition token. A request already in flight
  when a token begins, or starting while it is live, retains the transition label through delayed
  failure delivery.
- The PQ-020 route has two separate scopes: the awaited `page.reload()` call, and the public Continue
  click through production-owned flight/input readiness. The first closes before menu validation; the
  second begins only after the Continue menu screenshot and closes before restored-state capture.
- Both Browser and Electron receipts retain ignored cancellations. Console errors, page errors, HTTP
  failures, non-abort request failures, and aborts outside either exact transition remain hard
  failures.

Successive candidate-bound pairs falsified the initial assumption that the aborts belonged to the
reload itself. Browser repeatedly passed 21/21 with zero issues. Electron repeatedly completed 21/21,
matched every normalized gameplay fact, and closed its owned runtime, while a varying set of eight
lazy UI module aborts remained completely untagged. Moving collection earlier, retaining request
identity, and testing wrapper fingerprints did not change that outcome; those speculative variants
were removed rather than retained as complexity.

A short isolated Electron reload produced 2,951 request lifecycle events and zero failures. The full
route differs at one exact point: after reload presents Main Menu and starts lazy screen imports, the
actor clicks Continue while that registration generation can still be settling. Flight/input becomes
ready before all background registration promises close, so widening a cancellation scope through
flight readiness did not capture the later aborts. A request-wrapper fallback also captured zero and
was removed.

The durable boundary is the production owner's registration settlement. `uiRoot.registerScreens()`
now owns a generation-bound `Promise.allSettled` and records the settled generation only while its
cycle remains current. The route waits for that owner signal before the public Continue click and
again after the new flight/input generation becomes ready. Destroy/re-init invalidates the
generation, so stale work cannot satisfy either wait. No Continue-time cancellation ignore is
needed; only the exact document reload retains a cancellation scope.

Candidate digest `7accb892e30556c6b930fe891f5883cff88561c1d4c3820fb3c2de82ca2a42da`
proved the second wait is required: Browser passed 21/21 with zero issues; Electron completed 21/21,
matched facts, and closed cleanly, but the remaining abort set was dominated by dependencies of the
incoming flight UI generation. Settling only the outgoing menu generation could not cover that new
owner cycle.

## Focused evidence

- Recorded native failure: 21/21 Electron frames, normalized gameplay projection equal to Browser,
  owned runtime closed, but one stale registration error plus seven reload-aborted requests.
- `node --test test/ui-screen-registration-lifecycle.test.mjs test/browser-issues.test.mjs
  test/pq020-ceres-topology-manifest.test.mjs` — PASS, 19/19.
- The issue regression explicitly delivers the tagged request failure after the expected-navigation
  token closes, matching the observed Electron ordering; it covers both pre-existing and
  during-navigation request starts, and rejects post-navigation, untagged, completed, and non-abort
  failures.
- The lifecycle regression proves a new registration generation begins unsettled and a stale
  generation cannot revive after invalidation/re-init.
- The route regression requires owner-settled generations before the public Continue click and after
  restored flight/input readiness, and permits exactly one cancellation scope: the document reload.
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
