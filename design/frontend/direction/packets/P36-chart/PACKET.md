```yaml
packet: P36
title: The chart — the map as the picture, the bench at the edges
lane: CODE
tool: local (Codex gpt-6 for the canvas drawing pass; Grok for the bench; the controller integrates)
dependsOn: [P22, P13, P15]
current: [chart-galaxy, chart]
inputs: [design/frontend/direction/approved/frame-chart-galaxy.png, design/frontend/direction/approved/layer-chart-galaxy.png, design/frontend/direction/approved/plate-chart-field.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P36-REPORT.md
mutex: [chart]
```

# P36 — The chart

## Objective

`src/ui/galaxyMap.js` (11k lines, canvas 2D) keeps its data, lenses and inspector logic; its
**drawing** and its **bench** change. Drawing: sectors as lit star systems on a dimensional field
(nebula plates from P15 as texture layers, lanes as etched lines, traffic as small moving lights,
the tracked beacon as the one amber signal, the player's mark lit), typography through
`canvasFont` in the kit face at ≥ 12 px, glyphs from the icon family's `glyph-paths.json`. Bench:
lenses as three groups of legend keys, scope keys, the search as an engraved field, the inspector
as a narrow plate with the sector's name at 96 and the actions as keys, the cargo deck as a low
tape. The map's centre never covered.

## Write set

`src/ui/galaxyMap.js` (drawing + shell sections), `src/ui/map/*` presentation modules,
`src/ui/canvasFonts.js`, `styles/fh.css` (chart bench). `starmap.js`/`localmap.js` are legacy and
untouched.

## Checks and evidence

`npm run check:baseline` · the chart checks in `PQ-168.md` (atlas spatial truth, place path,
M2 cutover) · `npm run check:ui:perf` (the chart parks its rAF on hide) · `node scripts/capture-ui-matrix.mjs
--world --headed --only=chart-galaxy,chart --out=.devshots/frontend/P36` · a clip of pan, select,
route.

## Acceptance

Capture passes the rubric beside the frame; the field has depth and a subject with all lenses on;
no legend panel; the inspector is one plate; atlas checks green; the prior taste review's five
"cheap regions" are each gone (name them in the receipt).

## The way this gets faked

Recolouring the lens rail; adding a nebula JPG behind the same chart; covering the map with the
inspector.
