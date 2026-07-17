# G — Primary natural-route contract compliance

**Date:** 2026-07-17  
**Spine:** `C:\Users\93rob\Documents\GitHub\SpaceFace-depth-actualization`  
**Branch:** `grok/depth-player-route-actualization`  
**Tip:** `9b731fd4f5a31815ebf995d37c8f83e8e85005a1`  
**Owner:** Grok (spine)  
**Fence:** docs only this note; no new AC; residuals not waived  

## 1) What the strategist contract is

Single fail-closed source of truth for **primary** (≠ supporting) natural-route matrix acceptance:

| Artifact | Role |
|---|---|
| `scripts/lib/primaryNaturalRouteContract.mjs` | Seed policy, forbidden sources, earn carrier plan, harness static validator |
| `scripts/lib/naturalRouteSeeds.json` | Held-out seeds only (kept out of route configs) |
| `scripts/lib/earnUniqueWreckCarrier.mjs` | Dispatch to public `uniqueWrecks.earn*` methods |
| `scripts/check-depth-program-r2-natural-primary-matrix.mjs` | 12-wreck primary matrix gate |
| `src/systems/uniqueWrecks.js` | Production public earn carriers |
| `npm run check:depth-program:r2:natural-primary-matrix` | Package gate |

Schema: `spaceface.primaryNaturalRouteContract.v1`.

## 2) Compliance matrix (no new AC)

| Contract rule | Requirement | Compliance |
|---|---|---|
| **Held-out seeds ≥5** | `primaryMatrixSeeds()` loads `naturalRouteSeeds.json` `heldOut`; fails if `length < 5` | **MET** — held-out set `[91011, 91027, 91043, 91059, 91071]` (n=5); CI pair (`D10_CI_SEEDS`) is **supporting-only** |
| **Earned public carriers** | Primary path uses `earn*` / `game:started` (D10); **not** `surfaceAuthoredPrimaryCarrier` | **MET** — matrix calls `earnPrimaryCarrier`; contract forbids authored surface method on primary steps |
| **12/12 green** | Every wreck green on every held-out seed under `supporting:false` | **MET (contract gate)** — primary matrix OK line: 12 wrecks × held-out seeds, earned carriers, `supporting:false` |
| **Static naturalness** | No scan/salvage/choose bus inject; no `exactPos` / teleport; harness imports contract | **MET** — `validatePrimaryHarnessSources` + `classifyPrimarySteps` fail-closed |
| **Primary ≠ supporting** | CI pair / eligibility compression may only produce `supporting:true` | **MET** — `PRIMARY_CI_SEEDS_SUPPORTING_ONLY` labeled; supporting harnesses do not claim primary |

### Carrier plan (public earn — unchanged product surfaces)

| Wreck | Method | Channel |
|---|---|---|
| `wreck_choir_tender` | `game:started` | news |
| `wreck_dmc_ironsong` / `wreck_gravhand_tideline` | `earnSectorEnter` | comms / news |
| bar quartet (D7/D8/D9/D11) | `earnBarRumor` | bar |
| `wreck_lanebreaker_pale_coil` | `earnLostCoilsMission` | mission |
| `wreck_isc_vigilant` | `earnLossInvestigation` | loss_investigation |
| `wreck_isc_lighthouse` / `wreck_choir_cassandra` | `earnCampaignBeat` | campaign |
| `wreck_choir_bell_aegis` | `earnBarkPatrol` | bark |

These exercise production listener/record bodies after the player has reached the carrier surface. They are **not** full campaign UI or Tier-B browser e2e (out of primary matrix scope; not new AC).

## 3) What primary does **not** claim

Primary contract **closes only** the Tier-A 12-wreck natural matrix under held-out seeds + earned carriers. It does **not** close residual freeze rows:

| Residual (frozen open) | Why not primary green |
|---|---|
| Helix carriers | Paper faction / no natural fleet; §5.7 policy missing; fail-closed |
| E1 membership supporting | E1 remains supporting membership scaffold — not primary matrix |
| GT1 continuous candle-fleet REAL | Continuous full spine blocked; Candle Fleet not embodied |
| Electron dual-platform | Browser gallery supporting; Electron parity residual |

See `packets/RESIDUAL_FREEZE.md` and board residual freeze table in `03_STATUS_BOARD.md`. **None of these are done.**

## 4) Related (supporting, not re-scoped)

| Gate / return | Relation to primary contract |
|---|---|
| `check:depth-program:r2:natural-d10:primary` | D10 teaching primary multi-seed (≥5); claim via `resolvePlayerChoice` |
| `check:depth-program:r2:natural-d10` | Supporting C1 / inject regression |
| `G_EARN_CARRIER.md` | Earn API land notes |
| `PRIMARY_NATURAL_ROUTE_SOURCES_NOTE.md` | Static source validator delta |
| Prior `G_R2_PRIMARY_MATRIX.md` | Historical matrix return (CI-era notes may lag contract tip) |

## 5) Summary line

**Strategist primary contract compliant: held-out ≥5 · earned carriers · 12/12 green · supporting:false · residuals frozen open (Helix, E1 membership, GT1 candle-fleet REAL, Electron dual-platform) · tip `9b731fd4` · no new AC invented · not committed as docs-only status.**
