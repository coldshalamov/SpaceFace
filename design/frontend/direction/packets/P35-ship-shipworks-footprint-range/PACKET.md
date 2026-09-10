```yaml
packet: P35
title: THE SHIP and Shipworks on the stage; THE FOOTPRINT and THE RANGE on the kit
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P22, P20, P12, P16]
current: [ship, station-shipworks, footprint, range]
inputs: [design/frontend/direction/approved/frame-ship.png, design/frontend/direction/approved/layer-ship.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P35-REPORT.md
mutex: [instruments-direction, station-ui]
```

# P35 — THE SHIP, Shipworks, THE FOOTPRINT, THE RANGE

## Objective

**THE SHIP** built to its frame on the P20 stage (one context; `shipPreviewMount` and the shared
second-context stage retire here): the hull full-bleed and orbitable, hardpoint labels pinned by
etched leaders to lit sockets, the six dials as real gauges (P12), the four bands as instruments
along the bottom, WHAT YOU CAN DO NOW as backlit legend tiles, the presets and keys. **Shipworks**
is the same bench docked, with the parts column as tiles (P16 hull tiles where a hull is the
thing) and Install as one key. **THE FOOTPRINT**: the consequence graph drawn in etched lines on
the held world with the traced node lit; heat as a hero numeral; the wanted temperature.
**THE RANGE**: the drill box on the held world, the teaching sentence at 20 px on a legend strip,
the rung name at 96, the score tabular.

## Write set

`src/ui/ship/shipScreen.js`, `src/ui/ship/shipBandModels.js` (presentation only),
`src/ui/station/screens/shipworks.js`, `src/ui/shipPreviewMount.js` (retire), `src/ui/screens/footprint.js`,
`src/ui/screens/range.js` (presentation only; the teaching integrator untouched), `styles/station-workbench.css`
if still linked, `styles/fh.css`.

## Checks and evidence

`npm run check:baseline` · `node scripts/probe-ship-screen-capture.mjs` (one-mount invariant, now
on the stage) · `node --test test/secondary-preview-webgl.test.mjs` (retargeted) · the Range and
Footprint checks named in `PQ-188.md` · `node scripts/capture-ui-matrix.mjs --world --headed
--only=ship,station-shipworks,footprint,range --out=.devshots/frontend/P35`.

## Acceptance

THE SHIP capture passes the rubric beside its frame; the hull orbits on the main context and is
visible on the constrained-GPU path; the second WebGL context is gone; bands and dials are
asset-built gauges; Range and Footprint keep their verbs (fly the box, trace the graph).

## The way this gets faked

Keeping the second context; a node graph instead of a hull; dials that are ring SVGs with a border.
