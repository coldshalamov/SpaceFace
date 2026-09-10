```yaml
packet: P33
title: The station, part one — docking arrival, the shell, the Market, the Ledger
lane: CODE
tool: local (Codex or Grok in the shared checkout, isolated by write set and mutex (no worktrees); the controller integrates)
dependsOn: [P22, P20, P16]
current: [station-dock, station-market, station-ledger]
inputs: [design/frontend/direction/approved/frame-station-dock.png, design/frontend/direction/approved/frame-station-market.png, design/frontend/direction/approved/layer-station-market.png, design/frontend/direction/approved/kit-notes.md]
returns: commits + receipt design/frontend/direction/receipts/P33-REPORT.md
mutex: [station-ui]
```

# P33 — The station as a place: arrival, shell, Market, Ledger

## Objective

Docking becomes an arrival on the berth stage (P20 `berth` scene with the player's hull), the
station's name as a stencil marking, the destinations as a row of backlit keys with UNDOCK and its
readiness light, vitals on a quiet engraved plate; the docked temperature; the `ui_dock` swell.
The **Market** built to its frame: the exchange board as engraved rows on a plate with the selected
light, filters as legend keys, the selected commodity as an instrument (name at 96, price at 140,
the etched price trace in a smoked window, four backlit explanations, the trade console as keys,
stepper and one primary key). The **Ledger** as one hero numeral over engraved rows with the
income/cost numerals coloured. The berth stays visible through the bench windows.

## Write set

`src/ui/station/stationApp.js`, `src/ui/station/stationScreen.js`,
`src/ui/station/screens/market.js`, `src/ui/station/screens/ledger.js`, `src/ui/shipLedgerPanel.js`
(shared with the codex — change at the panel, keep its API), `styles/station.css` (retire
section by section), `styles/fh.css` (BENCH additions). Contracts, factions, industry, bar,
shipworks are P34/P35's.

## Checks and evidence

`npm run check:baseline` · the station runtime checks named in `design/program/roadmap/active/PQ-162.md`
(`check-station-tab-navigation-runtime`, departure/egress/interact-undock, mission-cargo-loading)
· `npm run check:ui:perf` · `node scripts/capture-ui-matrix.mjs --world --headed
--only=station-dock,station-market,station-ledger --out=.devshots/frontend/P33` with REAL data
(a docked station via `SF.bus.emit('dock:docked',{stationId})`, a populated hold) · a clip of dock →
market → buy → undock.

## Acceptance

Captures pass the rubric beside the frames; twelve rows visible, table ≤ half width, three
enormous elements; the berth visible through the windows (or the authored plate on constrained
GPUs); tab navigation checks green; keyboard/pad reach everything.

## The way this gets faked

The old station header with a plate behind it; commodity cards; a market that is a table across
the full width; a berth that is a JPG.
