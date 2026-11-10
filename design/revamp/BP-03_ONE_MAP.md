# BP-03 — ONE MAP (galaxy map cutover)

> **Extends** `design/world-identity/WORLD_NAVIGATION_SPEC.md`. **Builds on** Wave-1 `galaxyMap.js`.
> **Reconciliation 2** (REVAMP_MASTER §6): `galaxyMap` supersedes `localmap.js` + `starmap.js`.

## Goal
Objective #2: *one glance, total comprehension*. A single zoomable map (LOCAL → SYSTEM → SECTOR → GALAXY),
click-to-autopilot, fog only at true frontier. Retire the split N/M maps without ever shipping half.

## Scope
- [ ] Finish `galaxyMap.js` zoom levels + smooth transitions; render `sectorZones` as labeled tinted regions
      at SYSTEM level (safe/danger/profit/faction readable at a glance).
- [ ] Territory overlay: faction color wash per sector from `state.world.sectors[].owner`; show contested/flip.
- [ ] Fog policy: charted civilization is always visible (fix the old "??? behind discovery flags" bug); fog
      only genuine frontier until scanned/visited.
- [ ] Filters: economy / danger / factions / missions / resources / stations (toggle layers).
- [ ] Station select → services panel; zone select → threat/resources; click → `ui:setCourse` (done plumbing).
- [ ] **Parity checklist** (gate for cutover): everything the old maps did — trade-route ranking, mission
      landmarks, remembered-contact decay, route forecast/ETA — is present or intentionally dropped.
- [ ] Cutover: bind one key (retire N+M split in `bindings.js`/`input.js`), remove `localmap`/`starmap` from
      `SCREEN_MODULES`, keep behind a flag one release, then delete.

## Primary files
`src/ui/galaxyMap.js` (+ css) — own; `src/ui/bindings.js`, `src/ui/input.js`, `src/ui/uiRoot.js` (cutover,
orchestrator-gated); `src/ui/navigation/*` (reuse models); retire `src/ui/screens/localmap.js` + `starmap.js`.

## Acceptance
`check:galaxymap` (replaces `check:starmap-objective` + `check:localmap-routes`): one key opens the map; zoom
levels render sectors+zones; click autopilots to a station and to a sector; parity checklist passes before the
old maps are removed.

## Dependencies
Wave-1 `galaxyMap`; sector-ownership data; (later) BP-06 sector-flip rendering.
