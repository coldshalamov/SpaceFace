```yaml
packet: P34
title: The station, part two — Contracts, Factions, Industry, the Bar
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P33, P14]
current: [station-contracts, station-factions, station-industry, station-bar]
inputs: [design/frontend/direction/approved/frame-station-market.png, design/frontend/direction/approved/frame-mission-log.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P34-REPORT.md
mutex: [station-ui]
```

# P34 — Contracts, Factions, Industry, the Bar

## Objective

Four BENCH instruments derived from the approved Market and missions-log frames (no new frames):
**Contracts** — jobs as engraved rows with a class icon, payout numeral and the faction crest
(P14) small; the selected contract opened as an instrument (payout at 140, the route as an etched
line with end marks, risk as one legend, ACCEPT + BIND ROUTE as one primary key). **Factions** —
the focused faction's crest at 240 px on a plate, its name at 96, standing as one word and one
lit scale; the others as engraved rows with small crests. **Industry** — the station's work as
three or four gauges with a legend each; recipes as tiles with product icons (never truncated
chips). **The Bar** — the room on the stage or the P15 berth-bay plate, the portrait (kept), the
rumours as engraved sentences, the offer as two keys; no decorative quote mark.

## Write set

`src/ui/station/screens/contracts.js`, `factions.js`, `industry.js`, `bar.js`,
`src/ui/portraitArt.js` (framing only), `styles/station.css`, `styles/fh.css`.

## Checks and evidence

`npm run check:baseline` · the mission checks (`check:mission-board-recommendation`,
`check:mission-preflight`, `check:mission-handoff`, `check:one-voice`) · `npm run check:ui:perf` ·
`node scripts/capture-ui-matrix.mjs --world --headed --only=station-contracts,station-factions,station-industry,station-bar
--out=.devshots/frontend/P34` with real data.

## Acceptance

Each screen has a different silhouette and one enormous element; every list of things has
pictures; no truncated text anywhere at 1280; mission checks green; rubric passes beside the
nearest approved frame.

## The way this gets faked

Four screens that are the Market with different words; recipe chips; a rainbow standing dial.
