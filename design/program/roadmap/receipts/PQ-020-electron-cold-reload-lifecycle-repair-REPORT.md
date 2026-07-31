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
actor clicks Continue, which destroys that menu UI generation and starts restored flight. The
varying aborted URLs are members of that lazy screen graph. Therefore the missing authority boundary
is the menu-to-flight Continue transition, not the document reload. The new second scope tags only
requests active or started from the public click until production flight/input readiness. It does not
cover the menu screenshot, restored screenshot, later map input, or unrelated route work.

Candidate digest `277098519ff6174007d9e90f30050bfd2b3993124ad4df5b8505374357c18612`
then proved the second half of the boundary: Browser passed 21/21 with zero issues; Electron again
completed 21/21, matched facts, and closed cleanly, but none of the eight Continue-time aborts carried
object attribution. Electron exposes distinct request wrappers across the relevant start/failure
surfaces. The collector therefore uses method/resource/URL as a fallback only while that route is
unambiguous inside an expected transition. Any same-route request observed after the transition
invalidates the fallback before failure.

## Focused evidence

- Recorded native failure: 21/21 Electron frames, normalized gameplay projection equal to Browser,
  owned runtime closed, but one stale registration error plus seven reload-aborted requests.
- `node --test test/ui-screen-registration-lifecycle.test.mjs test/browser-issues.test.mjs
  test/pq020-ceres-topology-manifest.test.mjs` — PASS, 20/20.
- The issue regression explicitly delivers the tagged request failure after the expected-navigation
  token closes, matching the observed Electron ordering; it covers both pre-existing and
  during-navigation request starts, and rejects post-navigation, untagged, completed, and non-abort
  failures.
- The route regression requires separate reload and Continue scopes, places the second before the
  public click, retains production readiness, and requires exactly two scope closures.
- The wrapper regression permits one request-route fallback and proves a later same-route request
  invalidates that attribution and remains hard.
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
