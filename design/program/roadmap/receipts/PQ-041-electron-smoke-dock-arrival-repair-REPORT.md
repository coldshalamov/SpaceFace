<!-- LIFETIME: EVIDENCE -->
# PQ-041 station dock-arrival repair report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.electron-smoke-dock-arrival-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

Candidate `5c5421ac` completed the public Electron Main Menu, New Game, authored-flight, and
Helios-waypoint stages on real Intel ANGLE/D3D11. Default `flightV3` then declared the station course
`arrived` at `90.060 WU` from the station center, but the truthful PQ-008 docking route requires entry
through Helios's authored berth/capture corridor. The retained terminal point was outside that
capture volume, so waiting could not produce the physical dock prompt.

The focused regression first pinned that exact geometry: a legacy 90-WU off-corridor center-ring
stop does not classify as capture. Before the production repair, the test failed because default
flight exposed no berth-aware station-target authority.

## Repair

- Default `flightV3` resolves a live manifest-backed station waypoint to the manifest's authored
  world berth instead of the station center.
- The resolved station target owns a bounded arrival radius derived from the berth dock radius and
  capture half-width. Helios resolves to 36 WU; the existing flight safety floor makes the effective
  terminal radius 38 WU, inside the authored near-berth capture volume.
- Generic entities, literal-coordinate targets, and the compatibility flight implementation retain
  their prior targeting and arrival behavior.

No Electron, Browser, broker, GPU, package, performance, or human claim was spent by this repair.

## Focused evidence

- Red characterization: `node --test test/station-docking-corridor.test.mjs` — FAIL on the missing
  berth-aware default-flight exports.
- `node --test test/station-docking-corridor.test.mjs` — PASS, 18/18.
- `npm run check:flight:v3` — PASS.
- `npm run check:sim:compare` — PASS, equal deterministic hashes.
- `npm run check:baseline` — PASS, 10/10 in 30.955 seconds.

## Honest residual

The change is focused-green and materially changes the failed route, but it does not itself prove
the headed handoff from autopilot arrival through capture assist to a visible dock prompt and Ledger.
`PQ-041.electron-smoke-h1-capture` must spend one fresh candidate-bound Electron attempt for that
claim. Exact-package behavior, Browser/Electron parity, performance, and human judgment remain open.
