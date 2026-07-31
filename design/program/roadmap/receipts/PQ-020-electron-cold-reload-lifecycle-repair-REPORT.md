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
  `net::ERR_ABORTED` requests observed while such a token is live become retained ignored
  diagnostics.
- The PQ-020 route holds that token only around its awaited `page.reload()` call. The window closes
  before root validation, boot, Continue, asset readiness, screenshot, or subsequent input.
- Both Browser and Electron receipts retain ignored cancellations. Console errors, page errors, HTTP
  failures, non-abort request failures, and aborts outside the exact reload window remain hard
  failures.

## Focused evidence

- Recorded native failure: 21/21 Electron frames, normalized gameplay projection equal to Browser,
  owned runtime closed, but one stale registration error plus seven reload-aborted requests.
- `node --test test/ui-screen-registration-lifecycle.test.mjs test/browser-issues.test.mjs
  test/pq020-ceres-topology-manifest.test.mjs` — PASS, 17/17.
- `node scripts/check-ui-screen-imports.mjs` — PASS, 41/41.
- `npm run check:pq020:proofs` — PASS, 14/14.
- `node --check` for the changed UI, issue-collector, and route modules — PASS.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This repair launched no Browser or Electron process and makes no route, GPU, performance, physical
controller, visual, or human verdict. Production UI and harness sources changed, so the earlier
Browser PASS cannot certify the new candidate. `PQ-020.ceres-h1-capture` must spend one fresh
broker-owned Browser claim and one distinct Electron parity attempt.
