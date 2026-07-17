# G — D1 living opposition (F0 task 8)

**Date:** 2026-07-17  
**Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`)  
**Authority:** F0_FABLE_ADVISOR_RETURN §3 W2 task 8 · G_V2_D1_STATUS residual  
**Gate:** `npm run check:depth-program:d1:living-opposition`  
**Log:** `implementer/living-opposition.log`

## 1) Intent

Prove **≥1 doctrine-tagged hostile/carrier** appears in **ordinary crowded-sector play** without force-spawn.

F0 full bar also wants Helix carrier groups via encounterDirector/spawn-budget **after** Fable §5.7 policy. That ruling is still missing; this residual does **not** invent Helix carriers.

## 2) Path chosen

| Option | Decision |
|---|---|
| **A** minimal natural soak + safe product | **Taken** for original-nine zone ambient |
| **B** fail-closed residual only | Taken **for Helix only** (`FORCE_HELIX_CARRIER=1` fails closed) |

### Why this is safe (no golden thrash)

- **No** spawn-budget max / allotment change  
- **No** new ships / denser ambient / Helix zones  
- **No** encounterDirector pacing edits  
- **No** thrusters / assets / input.js  
- Stamp is **identity-only** (`factionDoctrineId` / `contactDoctrineId`) — does not replace `combatDoctrineId` or ROE from `makeEnemySpawnSpec`

## 3) Product

| File | Change |
|---|---|
| `src/systems/world.js` | `stampFactionDoctrineTag()` on zone-plan ambient and ring ambient when `FACTION_DOCTRINES` owns the faction |

Ambient hostiles already lived with combat doctrines (`interceptor_flyby`, etc.). D1 matrix profiles (`reach_predatory_overcommit`, `concord_measured_interdiction`, …) were audit-only until the ambient spawn owner stamped them. Zone factions already present on Sker / Ceres now surface the matching FACTION_DOCTRINES id on contacts.

## 4) Check

| Item | Value |
|---|---|
| Script | `scripts/check-depth-program-d1-living-opposition.mjs` |
| npm | `check:depth-program:d1:living-opposition` |
| Seeds | CI pair `48200`, `48201` |
| Sectors | `sector_sker_haven` (density 0.70), `sector_ceres_belt` (density 0.18 + zones) |
| Materialization | `registry.get('world').enterSector` only — no `spawn:request`, no `makeEnemySpawnSpec` harness, no SF |
| Green bar | every soak row has `doctrineTaggedCount ≥ 1` and living `combatDoctrineId` |
| Helix | `helixCarrierCount` reported; default green documents residual; `FORCE_HELIX_CARRIER=1` **fails closed** |

### Live soak evidence (HEAD)

| Seed | Sector | Contacts | FACTION_DOCTRINES | combatDoctrine | Helix |
|---|---|---:|---:|---:|---:|
| 48200 | sker_haven | 4 | 4 | 4 | 0 |
| 48200 | ceres_belt | 6 | 2 | 3 | 0 |
| 48201 | sker_haven | 4 | 4 | 4 | 0 |
| 48201 | ceres_belt | 6 | 2 | 3 | 0 |

Sample contact: `faction_reach` / `reach_predatory_overcommit` / `tether_control_raider` / `zone_hostile`.

Machine report: `.devshots/depth-program/d1-living-opposition.json`

## 5) REAL residual (Helix)

| Claim | Truth |
|---|---|
| Original-nine doctrine tags on natural ambient | **Green** (this residual) |
| Helix natural fleet carrier | **Missing** — no zone `factionId: faction_helix`, no ambient Helix squad |
| Blocker | Fable §5.7 spawn-policy (budget class, sector-danger gating, despawn) still unwritten |
| Fail-closed proof | `FORCE_HELIX_CARRIER=1 npm run check:depth-program:d1:living-opposition` → assertion failure documenting REAL gap |

Do **not** claim F0 task 8 fully closed until Helix carriers land under a signed policy.

## 6) Explicit non-goals

- Helix zone authoring / lazy Helix fleets  
- encounterDirector density retune  
- Golden re-record  
- Assets / thrusters / graphics  
- design/program status stamps  
- Commit

## 7) Charter block

```
LIVE AUDIT: F0 task 8; G_V2_D1_STATUS; FACTION_DOCTRINES; world ambient zone plan; sector_sker_haven / sector_ceres_belt density; no Fable §5.7 ruling on disk.
DIFF SUMMARY: src/systems/world.js stampFactionDoctrineTag on ambient; scripts/check-depth-program-d1-living-opposition.mjs; package.json script; implementer/living-opposition.log; this return.
GATES: check:depth-program:d1:living-opposition GREEN (4/4 doctrine-tagged soaks). FORCE_HELIX_CARRIER=1 RED (honest REAL residual).
FAILURE CLASS: N/A for original-nine ambient tags (REAL gap closed). Helix carriers remain REAL residual blocked on Fable policy — not fake green.
PLAN DRIFT: none vs prefer-small-product fence; no thrusters/assets; no spawn-budget thrash.
RESIDUAL: Helix natural fleet carriers after §5.7 ruling; optional full factionPresenceDoctrine ROE stamp on ambient (behavior-path, higher golden risk); uninjected multi-seed beyond CI pair.
```
