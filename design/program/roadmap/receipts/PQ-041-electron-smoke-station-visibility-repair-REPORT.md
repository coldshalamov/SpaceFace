<!-- LIFETIME: EVIDENCE -->
# PQ-041 Station visibility-harness repair report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.electron-smoke-station-visibility-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

Candidate `147df4dd` proved the repaired native route through the physical
`[ E ] DOCK AT STATION` prompt. Public held `E` then set `ui.docked=true` and
`dockedStationId=station_helios`, and the Station command-dock locator wait passed. The harness
immediately re-sampled the same surface with an opacity-sensitive `querySelector` predicate and
reported `screenVisible=false`.

That result contradicted independent evidence from the same attempt: the failure snapshot records
`visibleScreens=["station"]`, and original-resolution review of `failure-row8.png` shows the complete
Helios Station screen and command dock. Runtime/listener/profile cleanup passed with process exit 0;
only normal source CSP and shader warnings were present.

## Repair

- The retained failure facts are pinned in
  `test/fixtures/pq041-station-visibility-failure.json`.
- Exact Station-screen and command-dock locators now own the post-dock visibility authority.
- A locator-scoped ancestor-opacity wait covers the dock transition before the Station snapshot.
- The snapshot records those already-proven locator results instead of running a second immediate
  selector/opacity sample.

No Electron, Browser, broker, GPU, package, performance, or human claim was spent by this repair.

## Focused evidence

- Red characterization: `node --test test/h1-electron-e2e.test.mjs` — FAIL, 9/10, missing locator
  authority while the second selector remained.
- `node --test test/h1-electron-e2e.test.mjs` — PASS, 10/10.
- `node --check scripts/check-h1-electron-e2e.mjs` — PASS.
- `npm run check:launch-policy` — PASS.

## Honest residual

The repair removes the false negative but does not claim a complete native smoke. The next fresh
candidate-bound attempt must still prove Station capture, visible Ledger selection/content, zero hard
page/request errors, and owned cleanup. Exact-package, performance, and human claims remain open.
