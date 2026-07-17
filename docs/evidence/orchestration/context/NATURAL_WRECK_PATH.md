# Natural wreck path (orchestrator research)

## Production loop works for D10 without SF

New Game Helios → `game:started` auto-rumors Choir-Tender (D10) → map amber SEARCH AREA → fly 700–920 wu → scan:pulse from **player.pos** within 1200 → mining salvage → claim UI.

## R2 sweep is NOT natural

Sweep injects rumor, scans at exactPos, synthetic salvage/choose. Proves state machine only.

## Carriers (production)

| Slot | Carrier |
|---|---|
| D10 | game:started news in Helios |
| D11 | Helios bar rumors |
| D7–D9 | Bar at sker/haumea/reach |
| D2 | sector enter nyx_march comms |
| D6 | sector enter eunomia news |
| D4 | mission accept Lost Coils |
| D5 | Vael patrol bark |
| D3/D12 | story beats 7/6 |
| D1 | loss investigation primary only |

## Harness design

Tier A multi-seed headless: native carriers + player-origin scan + mining salvage.  
Tier B browser D10 UI e2e without coordinate teleport.

## Key files

uniqueWrecks.js, uniqueWrecks data, uniqueWreckRumorSurface, bar.js, galaxyMap, scanner, mining, recoveryEncounterPrompt
