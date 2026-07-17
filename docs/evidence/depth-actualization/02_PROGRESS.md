# Depth Actualization Sprint — Progress Log

**Worktree:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Base:** `f277c5e7`

## Completed this session

### P0 — Bootstrap
- Isolated worktree created from `origin/master`
- Baseline reds documented in `00_BASELINE.md`
- Forbid list honored (no mining, no assets/render, no menu redesign)

### P1 — Integrity (focused gates green)
| Area | Fix |
|---|---|
| F2 encounter soak | Global-coord boot + zone patrol (M2 regression) |
| F2 one-voice soak | Same |
| F2/V2 indexes | Regenerated encounter + flavor graphs |
| GT1 loot audit | Pin live 13 combat tables (not historical 8) |
| Alpha evidence contract | Assert current program front door |
| SP1 duration | Investigation stage `destStationId`; expand matrix to 10 routes |
| K1 Fulfillment EMP | EMP disruptor dmg 45→96 so disable verb works; multi-hit fixtures |
| All focused depth gates sampled | r1,r2,v1,v2,e1,a1,a2,sp1,k1,s3,f2,gt1 GREEN |

### A2 Ship's Ledger — player reachability
- **Decision:** pause menu path (not station redesign)
- `src/ui/screens/shipLedgerScreen.js` wraps existing panel
- Registered in `uiRoot.js`
- Pause button "Ship's Ledger"
- `check:depth-program:a2` now enforces wiring

### S4 titles — registry wiring
- `titlesSystem` imported and registered after `story`
- Smoke: `registry.get('titles')` works
- Focused S4 tests still 11/11
- Remaining: real `title:holdResolved` producers, morale/decal/news consumers, fleet proof, B16–B20 assets residual

### A1 physical Band actors
- `poi_quiessence` on Pallas Drift + 17 census hull markers (stamped `flavorTargetRef` / `quiessenceShipIndex`)
- `poi_hush` on Eunomia Gulf (stamped `flavorSourceId: planet_hush`)
- World spawn stamps Band proximity keys; no new GLBs
- Tests: `test/depth-program-a1-physical-actors.test.mjs` (3/3) wired into `check:depth-program:a1`

## Still open (sprint exit)

- Unassisted multi-seed browser+Electron routes for R1/R2/E1/SP1/GT1
- A1 physical Quiessence/Hush actors
- V2 missing producers (ad-board, etc.) natural reachability
- D1 natural doctrine carriers / Helix fleets
- Alpha **live** evidence corpus (worktree has no `.devshots/alpha`)
- Full `check:depth-program:contracts` cold re-run
- 3 polish gallery sweeps
- Status ledger DONE stamps in `design/program/**` (lead integration)

## File change set (worktree)

```
docs/evidence/depth-actualization/*
scripts/check-encounter-director.mjs
scripts/check-encounter-one-voice.mjs
scripts/check-depth-program-k1-behavior.mjs
scripts/check-depth-program-a2.mjs
src/data/encounters/index.generated.js
src/data/flavor/index.generated.js
src/data/missions.js
src/data/weapons.js
src/core/registry.js
src/ui/uiRoot.js
src/ui/screens/pause.js
src/ui/screens/shipLedgerScreen.js  (new)
test/alpha-evidence-checker.test.mjs
test/depth-program-gt1-loot-audit.test.mjs
test/depth-program-k1-fulfillment.test.mjs
test/depth-program-sp1-duration.test.mjs
```
