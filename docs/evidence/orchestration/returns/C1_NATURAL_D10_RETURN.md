# C1 — Natural D10 Choir-Tender Route Return

**Date:** 2026-07-17  
**Route:** `docs/evidence/orchestration/packets/C1_CODEX_R1R2_HARNESS.md` read  
**Scope:** D10 Choir-Tender natural production path (headless)  
**Script:** `scripts/check-depth-program-r2-natural-d10.mjs`  
**Runner:** `npm run check:depth-program:r2:natural-d10`

## 1) Inputs requested vs actual

`NATURAL_WRECK_PATH.md` and `F1_NATURAL_ROUTE_HARNESS_SPEC.md` were not present in this checkout, so harness work proceeded using the packet + live R2 contracts already in-repo.

## 2) What was implemented

- Added `scripts/check-depth-program-r2-natural-d10.mjs`:
  - bootstraps simulation with systems `uniqueWrecks`, `cargo`, `ships`
  - sets sector `sector_helios_prime` and emits `game:started` (no direct rumor source payload injection)
  - drives D10 through phases:
    - `rumored` (from natural `game:started` carrier flow)
    - `fixed` (scan pulse emitted from `player.pos`)
    - `decision` (after `salvage:completed`)
    - `salvaged` (after selecting the unique-drop choice)
  - sets player to `record.exactPos` before scan and asserts this is within `UNIQUE_WRECK_SCAN_RADIUS`
  - asserts global-coordinate semantics: `coordSpace === 'global_v1'`, record/fixed position == spawned wreck position
- Added `check:depth-program:r2:natural-d10` script in `package.json`
- Output artifact:
  - `.devshots/depth-program/r2-natural-d10-headless.json`

## 3) Multi-seed policy

- `BASE_SEED`: `48200`
- `SEED_COUNT`: `5` (seeds 48200–48204)
- Each seed is run independently against fresh `createSimulation` state.

## 4) Contract assertions

- D10 rumor channel/path: `news`
- Primary source: `news.tragedy_at_helios`
- Sector: `sector_helios_prime`
- Coordinates: global (`global_v1`) and wreck spawn at authored global exact placement
- Phase order: `['rumored','fixed','decision','salvaged']`
- Reward grant: D10 unique module reward present in `state.player.moduleInventory`

## 5) Fence compliance

- No `assets` edits
- No `thrusters` edits
- No `input.js` edits
- No station redesign edits
