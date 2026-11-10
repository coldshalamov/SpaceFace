# H1 row 2 — PQ-021 Ledger route, Browser broker cell + Electron parity

**Result: PASS.** The broker-issued Browser acceptance cell and the Electron functional-parity
route both passed. Human legibility judgement and a real physical-controller pass remain Phase H2.

## Browser broker cell

Command:

```text
node scripts/validation-broker-cli.mjs --manifest pq021-ledger-route
```

Broker result:

- `status: pass`
- fixed seed `47`
- one Browser launch; the claim was issued, consumed, and bound to the route receipt
- five Wreck Cathedral evidence pages earned through
  `asteroidSites.applyWorldSiteBeamOperation` in the live runtime (nine ordinary operations)
- station host: Helios dock → Ledger destination; five pages admitted
- flight host: `K` → Codex → Ledger tab; the same five pages admitted
- every page carries its authored image, alt text, caption, provenance, title, fragment and body
- every page records `focusOnBack: true` and `focusReturnedToOpener: true`
- Browser page issues: none

The only declared shortcut in the receipt is travel: the player is placed in `sector_ceres_belt`
instead of spending the capture walking the full inter-sector distance. Evidence earning and both
read routes are ordinary runtime/UI paths.

Browser stills:

- [station Ledger list](station-ledger-list.png)
- [station evidence page](station-ledger-evidence.png)
- [flight/Codex Ledger list](flight-codex-ledger-list.png)
- [flight/Codex evidence page](flight-codex-ledger-evidence.png)

## Electron parity

Command:

```text
node scripts/check-pq021-ledger-route-electron.mjs
```

Result:

- `disposition: PASS`
- problems: none
- five pages admitted through each Electron host
- both Electron hosts were compared field-for-field against the Browser receipt
- `crossRuntimeParity: compared against .devshots/pq021-ledger-route/route-receipt.json`

Electron stills:

- [station Ledger list](electron/station-ledger-list.png)
- [station evidence page](electron/station-ledger-evidence.png)
- [flight/Codex Ledger list](electron/flight-codex-ledger-list.png)
- [flight/Codex evidence page](electron/flight-codex-ledger-evidence.png)

## Harness defect found before the route attempt

The Electron entry had never been run. Pre-route launch checks exposed two **HARNESS** defects:

1. it treated `createIsolatedElectronLaunch()`'s descriptor as an ElectronApplication and failed on
   `app.firstWindow is not a function`;
2. after the descriptor was spawned correctly, it waited for `domcontentloaded` before following the
   standard `about:blank` → canonical loopback-root bootstrap and timed out before any Ledger step.

The repair copies the proven ownership/bootstrap pattern already used by the Alpha and
professional-travel Electron evidence routes: explicit `electron.launch(launch.options)`, canonical
URL tracking, root assertion, owned process cleanup, then isolated-profile cleanup. A static
contract test fails without that pattern and passes with it. **No game/product code changed.** The
single route attempt after the harness became capable of reaching its subject passed.

## NOT performance evidence

`latest-run-result.json` contains the broker process's `durationMs`; its committed copy is stamped
`"informational_contended": true`. That value is not evidence. Neither Browser nor Electron route
receipt contains frame timing, p95/p99, hitch, or other performance fields. Matched performance
remains Phase H3.

## Machine-readable files

- `route-receipt.json` — Browser route contract
- `electron/route-receipt.json` — Electron route contract and Browser comparison
- `fast-gate.json` — broker fast-gate receipt
- `latest-run-result.json` — broker process record; timing flagged informational
- `electron-run.log` — final Electron PASS line
