```yaml
packet: P31
title: Flight HUD, part one — the instruments (speed gauge, ship block, action bar sockets, status strip, objective plate, comms tape)
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P22, P12]
current: [flight, power-rail, pause]
inputs: [design/frontend/direction/approved/frame-hud-resting.png, design/frontend/direction/approved/layer-hud-resting.png, design/frontend/direction/approved/crops-hud.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P31-REPORT.md
mutex: [flight-hud]
```

# P31 — Flight HUD: the instruments

## Why two packets

`src/ui/hud.js` is 4,661 lines with its CSS in a 1,346-line template literal
(`src/ui/views/hudStyles.js`) plus six more injected `<style>` nodes. Rebuilding it in one packet
is the one-shot trap. P31 rebuilds the bottom and left instruments; P32 the right-side sensors and
the law badge and the wanted temperature. Both keep the three-anchor layout, the receipts channel,
the Power Rail's slot-claim contract and its **no-rAF** rule.

## Objective

The approved HUD frame's instruments, asset-built (P12) at EDGE scale, with the resting state
dim and waking on change: the speed **gauge** (bezel, needle SVG rotated by value, lit arc, hero
numeral in the window), the **ship block** plate with the hull silhouette in a smoked window and
the energy/drive **segmented bars**, the action bar as **sockets** with the icon family and the
engraved key legends grouped by etched brackets (the Power Rail, re-skinned, contract intact),
the **status strip** of ten lights, the **objective plate** with the chevron, the **comms tape**
with caps, the tip line as stencil text. A new `styles/hud.css` owns the CSS; the template-literal
styles retire section by section.

## Write set

`src/ui/hud.js` (instrument sections only), `src/ui/views/hudStyles.js` (retire what moves),
`src/ui/powerRail.js` (skin only; contract untouched), `styles/hud.css` (new), `styles/fh.css`
(EDGE additions). `src/ui/radar.js`, `targetPanel.js`, `sectorLawPresenter.js` are P32's.

## Checks and evidence

`npm run check:baseline` · `npm run check:ui:perf` (2 ms/surface, 1,500 nodes, frame-sleep) ·
`npm run check:radar:perf` · `node scripts/check-ui-frame-sleep.mjs` · `npm run probe:runtime-witness`
(HUD frame cost ≤ before) · `node scripts/capture-ui-matrix.mjs --world --headed --only=flight,power-rail,pause
--out=.devshots/frontend/P31` · a 10-second flight clip showing the gauge and bars moving.

## Acceptance

Captures pass the rubric beside the frame for the instruments this packet owns; no rAF added; the
UI frame budget holds; the Power Rail's runtime checks stay green; forced-colours keeps every
instrument legible (inline SVG, `currentColor`).

## The way this gets faked

Restyling the existing text boxes with a plate background; a gauge that is a number with a border;
sockets that are the old rail with new colours; moving CSS into `hud.css` without changing the DOM.
