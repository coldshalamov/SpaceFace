<!-- LIFETIME: EVIDENCE -->
# PQ-041 Electron H1 smoke-capture report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.electron-smoke-h1-capture
lifecycleClaim: h1_route_accepted
acceptanceClaim: source_electron_functional_route
disposition: PASS
candidateCommit: c8b4fa2ca8be5239194879ec09380f43bf764af8
headedElectronLaunched: true
performanceEvidenceClaimed: false
exactPackageClaimed: false
```

## Accepted route

One candidate-bound source-Electron launch completed the public fixed-seed route:

`canonical root → Main Menu → New Game → authored flight → public Helios waypoint/autopilot →
physical [ E ] dock prompt → held E → Station command dock → Ledger`.

The player remained alive, one held `E` input docked at `station_helios`, and the Ledger tab was
visibly selected with accessible name `st-ledger-station-title`, title `The Ship's Ledger`, and a real
entry/empty-state content surface. All six original-resolution frames were reviewed. This is a
functional H1 route verdict, not a human legibility or visual-quality verdict.

## Runtime and ownership evidence

- candidate: `c8b4fa2ca8be5239194879ec09380f43bf764af8`;
- fixed seed: `47`;
- launches: Browser `0`, Electron `1`, retry `false`;
- GPU: real Intel ANGLE Direct3D11, software fallback `false`;
- hard page/request errors: none;
- informational warnings: source-runtime Electron CSP plus shader compiler warnings;
- owned cleanup: page/app/process/listener/profile PASS, process exit `0`, no force-close.

The hash-bound pass report, six frames, launch controls, run log, and three retained continuation
failures are under `design/program/roadmap/evidence/h1/row8-electron-e2e/`. The root historical
Main Menu failure remains unchanged; the accepted continuation is additive.

## Causal repair trail

- `PQ-041.electron-smoke-harness-repair`: one Main Menu role-locator authority.
- `PQ-041.electron-smoke-dock-arrival-repair`: station target resolves the authored berth instead of
  the legacy center ring.
- `PQ-041.electron-smoke-corridor-approach-repair`: station course stages through the authored gap.
- `PQ-041.electron-smoke-station-visibility-repair`: Station visibility reuses locator authority
  through the dock transition.

Each reproduced fingerprint has a seconds-scale regression and its own focused-green receipt.

## Honest residual

This receipt does not claim an unpacked/generated executable, `app.isPackaged`, Browser/Electron
paired parity, quiet-window performance, physical-controller input, or human visual judgment. Those
remain with their exact downstream units and named owners.
