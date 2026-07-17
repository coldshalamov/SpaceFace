# G — Public earn-carrier APIs (unique wrecks)

**Date:** 2026-07-17  
**Branch:** `grok/depth-player-route-actualization`  
**Author:** Grok (spine)  
**Status:** implemented · not committed  

## Goal

Replace primary-matrix use of `surfaceAuthoredPrimaryCarrier` with **earned public carriers** that call the same production bodies as sector enter, bar, mission accept, loss promote, campaign beat, and bark — without harness `uniqueWreck:*` injects or raw `moduleInventory.push`.

## Public API (`src/systems/uniqueWrecks.js`)

| Method | Channel / wrecks | Production body |
|---|---|---|
| `earnSectorEnter(sectorId)` | D2 Ironsong (comms), D6 Tideline (news) | `_onSectorEnter` + `surfaceSectorCarriers` |
| `earnBarRumor(stationId)` | D7 Nestbreaker, D8 Deepsurvey, D9 Smokesong, D11 Silver-Draft | `uniqueWreckBarRumor` → `_onNativeRumor('bar', …)` |
| `earnLostCoilsMission()` | D4 Pale-Coil | `surfaceDockCarriers('station_helios')` → mission accept record |
| `earnLossInvestigation()` | D1 Vigilant | `_onLossPromoted` (loss promote path) |
| `earnCampaignBeat(wreckId\|beatIndex)` | D3 Lighthouse (7), D12 Cassandra (6) | `_onNativeRumor('campaign', …)` |
| `earnBarkPatrol()` | D5 Choir-Bell Aegis | `_onNativeRumor('bark', Vael patrol)` |
| `equipSurveySuiteIfNeeded(defId?)` | D1 / D4 scan gate | `ships.grantModule` then optional `fitModule`; fittings fallback |

**Still present (supporting only):** `surfaceAuthoredPrimaryCarrier` — marked deprecated for primary; capture / supporting harnesses only.

**D10:** remains production `game:started` (Helios news); not an `earn*` method.

## Dispatch helper

`scripts/lib/earnUniqueWreckCarrier.mjs`

- `earnPrimaryCarrier(system, def, ctx)` — wreck → earn path (uses `PRIMARY_CARRIER_PLAN` / `BAR_STATION_BY_WRECK`)
- `equipSurveySuiteIfNeeded(system, defId?)` — thin wrapper
- `earnMethodForWreck(wreckId)` — plan lookup

Primary matrix should call these (or the system methods directly). **Do not** call `surfaceAuthoredPrimaryCarrier` on the primary path (`primaryNaturalRouteContract.mjs` forbids it).

## Contract alignment

`scripts/lib/primaryNaturalRouteContract.mjs` → `PRIMARY_CARRIER_PLAN`:

| Wreck | Method |
|---|---|
| `wreck_choir_tender` | `game:started` |
| `wreck_dmc_ironsong` / `wreck_gravhand_tideline` | `earnSectorEnter` |
| bar quartet | `earnBarRumor` |
| `wreck_lanebreaker_pale_coil` | `earnLostCoilsMission` |
| `wreck_isc_vigilant` | `earnLossInvestigation` |
| `wreck_isc_lighthouse` / `wreck_choir_cassandra` | `earnCampaignBeat` |
| `wreck_choir_bell_aegis` | `earnBarkPatrol` |

## What is intentionally *not* full playthrough

These APIs exercise the **same listener / record bodies** production uses after the player has already reached the carrier surface (docked Helios, entered sector, asked the barkeep, etc.). They do **not** simulate full campaign UI, mission-board DOM, or live bark director AI. Tier B browser e2e remains separate.

## Verification

```bash
node --test test/depth-program-earn-carriers.test.mjs
```

Expect: all earn paths record the correct `sourceRef` / `channelId` / `rumored` phase; survey suite lands via `ships.grantModule` or owned fittings (no harness `moduleInventory.push` in the API).

## Files touched

| Path | Change |
|---|---|
| `src/systems/uniqueWrecks.js` | `earn*` + `equipSurveySuiteIfNeeded`; bar via pure adapter |
| `scripts/lib/earnUniqueWreckCarrier.mjs` | matrix dispatch helper |
| `test/depth-program-earn-carriers.test.mjs` | focused unit coverage |
| `docs/evidence/orchestration/returns/G_EARN_CARRIER.md` | this note |

## Residual

- Wire `check-depth-program-r2-natural-primary-matrix.mjs` `surfacePrimaryCarrier` to `earnPrimaryCarrier` (out of this slice if matrix still green on supporting carrier — follow-up).
- Full missions.acceptMission board path for Lost Coils remains proven by `test/depth-program-r2-mission-channel.test.mjs`; earn API mirrors accept payload without requiring missions system in Tier A.

## Summary line

**Public earn carriers landed on uniqueWrecks + dispatch helper · survey suite via ships · primary must not use surfaceAuthoredPrimaryCarrier · focused test green · not committed**
