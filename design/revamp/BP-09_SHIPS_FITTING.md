# BP-09 — SHIPS & FITTING

> **Extends** `SPEC3-F5` (§23 outfitting-core, §24 modules-flux). The tech tree + fitting core is deep and
> stable; this adds the *strategic loadout* layer and registers already-authored art.

## Goal
Ships become loadout puzzles (physics = balance), not raw stat comparisons.

## Scope
- [ ] **Nested outfit-space budgets** — a master pool ⊃ weapon/engine sub-pools (Endless Sky model). Data in
      `src/data/ships.js`; enforcement in the fitting/outfitting flow.
- [ ] **Mount size/type gating** — S/M/L + compatibility classes; a hardpoint refuses an incompatible weapon.
- [ ] **Engine vs thruster split** — Drive (forward) and Maneuver (turn) as separate parts; feeds BP-07 mass model.
- [ ] **Register authored parts** — the 5 engines + 6 weapons already in `assets/ships/parts/` but missing from
      `parts_manifest.json` + `partsLibrary.js` (coordinate with BP-08). Wire so they load without fallback.
- [ ] **Ship threat/level badge data** — expose class/level/threat on entities for the HUD + galaxyMap to show.

## Primary files
`src/systems/ships.js`, `src/data/ships.js`, `src/data/modules.js`, `src/systems/crafting.js` (owner),
`assets/ships/parts/parts_manifest.json` + `src/render/partsLibrary.js` (asset registration, with BP-08).

## Acceptance
`check:fitting` (new): outfit-space budget rejects over-fit; mount gating rejects wrong size/type;
`check:assets:live` shows the newly-registered engines/weapons loading; threat badge fields present on entities.

## Dependencies
BP-08 (part art coordination); BP-07 (mass model consumes engine/thruster split).
