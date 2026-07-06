# BP-06 — BASES & TERRITORY

> **Extends** `SPEC3-F6` (§26 player-bases, §27 tower-defense, §28 territory-war). Consumes `sectorZones`
> (placement), `encounterDirector` (siege waves), `galaxyMap` (territory/flip rendering), BP-08 (module GLBs).

## Goal
A claimed base is *a place that is yours*, not a production buffer. Territory is visible and contestable.

## Scope
- [ ] **12–16 claimable bodies** (vs 2 today) with authored placements in `src/data/claimableBodies.js`,
      anchored to appropriate zones (mining belts, quiet corners, border posts).
- [ ] **Visible modular construction** — Depot / Refinery / Defense Battery / Teleporter / Hangar / Habitat /
      Sensor as **visible structures** on the body mesh (BP-08 authors ~7 module GLBs), not abstract nodes.
- [ ] **Inter-module synergy** — e.g. Refinery output auto-feeds Depot; Sensor extends encounter warning;
      turn base-building from slot-filling into a build-order puzzle.
- [ ] **Upkeep + supply lines** — modules consume `cmdty_base_parts`; underpay → distress (extends automation).
- [ ] **Defense tower-defense minigame** — Defense Battery turret control vs `encounterDirector` siege waves.
- [ ] **Territory on the map** — faction zones render on `galaxyMap`; control gates access/prices/patrols;
      **sector flips** animate on the map with a comms announcement (the offscreen war becomes visible).

## Primary files
`src/systems/claims.js`, `src/data/claimableBodies.js` (own), `src/systems/automation.js` (upkeep),
`src/systems/factions.js`/`sectorSim.js` (war → flips), `galaxyMap.js` (render), BP-08 module GLBs.

## Acceptance
`check:bases-territory` (new): ≥12 claimables; a built module renders on the body; synergy bonus applies;
a siege wave spawns via the director within budget; a sector flip renders on the map.

## Dependencies
`encounterDirector`, `galaxyMap`, BP-08 module assets; automation (upkeep).
