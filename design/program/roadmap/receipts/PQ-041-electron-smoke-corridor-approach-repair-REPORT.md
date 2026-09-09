<!-- LIFETIME: EVIDENCE -->
# PQ-041 station corridor-approach repair report

```yaml
packet: PQ-041
dispatchUnit: PQ-041.electron-smoke-corridor-approach-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedElectronLaunched: false
performanceEvidenceClaimed: false
```

## Recorded failure

Candidate `93143293` completed canonical root, Main Menu, New Game, authored flight, and the public
Helios waypoint on real Intel ANGLE/D3D11. The prior repair correctly replaced the legacy 90-WU
center-ring target with the authored berth, but a direct course from an arbitrary bearing could still
meet Helios's compound silhouette outside its snapped gap. At timeout autopilot remained active and
`cruising`, the visible speed was zero, the player was alive at
`(1233.7025146484375, -489.2889404296875)`, and berth distance was
`115.11044802097827 WU`. No physical dock prompt existed.

The Electron runtime, listener, page, and profile all closed cleanly with process exit 0. The only
page issues were the normal source-runtime CSP warning and shader warnings. The attempt was not a
performance, package, parity, or human claim.

## Red regression

The live station center `(1280, -420)` and retained terminal player coordinates were translated into
the origin-centered Helios fixture. The regression proves that exact point is outside both corridor
and capture, preserves the `115.11044802097827 WU` berth distance, and initially failed because
default flight returned no `corridor-mouth` stage.

## Repair

- A manifest-backed station course now targets the manifest-owned corridor mouth while the player
  is outside the authored lane.
- Once the player is geometrically inside the corridor/capture or comes within 45 WU of the mouth,
  the terminal target switches to the authored berth.
- The switch occurs seven WU before the existing 38-WU flight arrival floor could stop and deactivate
  the staging leg.
- Generic targets and compatibility `flight.js` remain unchanged.

## Focused evidence

- Red characterization: `node --test test/station-docking-corridor.test.mjs` — FAIL, 18/19, missing
  `corridor-mouth` stage.
- `node --test test/station-docking-corridor.test.mjs` — PASS, 19/19.
- `npm run check:flight:v3` — PASS.
- `npm run check:sim:compare` — PASS, equal deterministic hashes.
- `npm run check:baseline` — PASS, 10/10 in 45.860 seconds.

## Honest residual

This headless repair proves target staging and all focused invariants, but it does not prove that the
full native trajectory reaches the visible physical dock prompt and Ledger. A fresh candidate-bound
`PQ-041.electron-smoke-h1-capture` attempt is required. Exact-package behavior, Browser/Electron
parity, performance, and human judgment remain open.
