# G — D1 living opposition (F0 task 8)

**Date:** 2026-07-17  
**Owner:** Grok (SPINE `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization`)  
**Authority:** F0_FABLE_ADVISOR_RETURN §3 W2 task 8 · G_V2_D1_STATUS residual  
**Gate:** `npm run check:depth-program:d1:living-opposition`  
**Log:** `implementer/living-opposition.log`  
**Tip context:** ~`6475e2ef+` (no commit this residual)

## 1) Intent

Prove **≥1 doctrine-tagged hostile/carrier** appears in **ordinary crowded-sector play** without force-spawn.

F0 full bar also wants Helix carrier groups via encounterDirector/spawn-budget **after** Fable §5.7 policy. That ruling is still missing.

This residual:
1. Keeps original-nine ambient doctrine tags green (prior product).
2. **Re-evaluates** product-safe paths to get `helixCarrierCount ≥ 1` on at least one soak.
3. When blocked, **strengthens** fail-closed documentation — does **not** invent Helix carriers or fake green.

## 2) Option decision (Helix residual re-pin)

| Option | Precondition from shipped data | Decision |
|---|---|---|
| **1** Stamp Helix doctrine on an ambient faction that already spawns **if Helix owns a zone** | Helix zone `factionId` or `presence.factionId` must exist | **BLOCKED** — zero Helix zones / presence |
| **2** Low-risk authored ambient Helix patrol in one high-danger sector **if Helix already has faction presence** | `homeSectors` non-empty + non-paper fleet + ship roles | **BLOCKED** — paper faction (`fleetClass:'none'`, `homeSectors:[]`, `shipRoles:[]`) |
| **3** Strengthen residual + `FORCE_HELIX_CARRIER` fail-closed; do **not** fake green | Always available when 1–2 fail and §5.7 missing | **TAKEN** |

### Why option 1 fails (data)

- `src/data/sectorZones.js` + frontier merge: **0** zones with `factionId: 'faction_helix'`.
- **0** zones with `presence.factionId: 'faction_helix'`.
- Crowded soak sectors (`sector_sker_haven`, `sector_ceres_belt`) are Reach/DMC/SCN only.
- `stampFactionDoctrineTag` only stamps the doctrine of the **actual** spawn `factionId`. There is no Helix ambient to stamp without inventing ownership.

### Why option 2 fails (data)

From `src/data/factions/helix.js` (live product truth):

```js
// Paper faction (BP-05): content surfaces only, zero ships.
homeSectors: [],
fleetClass: 'none',
shipRoles: [],
personality: 'paper',
```

- No sector presence → nowhere legitimate to author a “Helix already here” patrol.
- No fleet class / hulls → a Helix ship spawn would invent a fleet that product data explicitly forbids.
- Lore note that Helix cutters sometimes fly MTS/Reach transponders does **not** authorize stamping Helix doctrine onto MTS/Reach contacts (that would be an identity lie and fake green).

### Why option 3 is the only product-safe path

- Fable §5.7 spawn-policy (budget class, sector-danger gating, despawn) remains **unwritten**.
- F0 task 8 and G_V2_D1_STATUS explicitly require that ruling before encounterDirector / spawn-budget product change.
- Unsafe shortcuts rejected:
  - Stamp Helix doctrine on MTS/Reach without zone ownership
  - Author Helix zone/presence without §5.7
  - Spawn-budget thrash / denser ambient
  - Default-green waiver of Helix bar

## 3) Path chosen (original nine — prior; Helix — option 3)

| Layer | Decision |
|---|---|
| **Original-nine ambient** | **A** minimal natural soak + identity stamp (already green) |
| **Helix** | **B / option 3** fail-closed residual only |

### Why this is safe (no golden thrash)

- **No** spawn-budget max / allotment change  
- **No** new ships / denser ambient / Helix zones  
- **No** encounterDirector pacing edits  
- **No** thrusters / assets / input.js  
- Original-nine stamp remains **identity-only** (`factionDoctrineId` / `contactDoctrineId`) — does not replace `combatDoctrineId` or ROE from `makeEnemySpawnSpec`

## 4) Product

| File | Change |
|---|---|
| `src/systems/world.js` | (prior) `stampFactionDoctrineTag()` on zone-plan ambient and ring ambient when `FACTION_DOCTRINES` owns the faction — **unchanged this residual** |
| `scripts/check-depth-program-d1-living-opposition.mjs` | **Strengthened:** static Helix impossibility audit (options 1–2), richer `helixBlockers` report, stronger `FORCE_HELIX_CARRIER=1` fail message |
| `docs/evidence/orchestration/returns/G_D1_LIVING_OPPOSITION.md` | This return (option proof + residual) |
| `docs/evidence/orchestration/packets/FABLE_HELIX_RESIDUAL.md` | Re-pin packet with data blockers |

Ambient hostiles already lived with combat doctrines (`interceptor_flyby`, etc.). D1 matrix profiles (`reach_predatory_overcommit`, `concord_measured_interdiction`, …) surface on contacts for original-nine zone factions. Helix doctrine remains matrix/registry-live only.

## 5) Check

| Item | Value |
|---|---|
| Script | `scripts/check-depth-program-d1-living-opposition.mjs` |
| npm | `check:depth-program:d1:living-opposition` |
| Seeds | CI pair `48200`, `48201` |
| Sectors | `sector_sker_haven` (density 0.70), `sector_ceres_belt` (density 0.18 + zones) |
| Materialization | `registry.get('world').enterSector` only — no `spawn:request`, no `makeEnemySpawnSpec` harness, no SF |
| Green bar | every soak row has `doctrineTaggedCount ≥ 1` and living `combatDoctrineId` |
| Helix default | `helixCarrierCount` reported; `helixBlockers` proves options 1–2 blocked; residual **not** waived as green |
| Helix forced | `FORCE_HELIX_CARRIER=1` **fails closed** with blocker payload |

### Live soak evidence (this residual)

| Seed | Sector | Contacts | FACTION_DOCTRINES | combatDoctrine | Helix |
|---|---|---:|---:|---:|---:|
| 48200 | sker_haven | 4 | 4 | 4 | 0 |
| 48200 | ceres_belt | 6 | 2 | 3 | 0 |
| 48201 | sker_haven | 4 | 4 | 4 | 0 |
| 48201 | ceres_belt | 6 | 2 | 3 | 0 |

Sample contact: `faction_reach` / `reach_predatory_overcommit` / `tether_control_raider` / `zone_hostile`.

### Static Helix blockers (machine-checked)

| Field | Value |
|---|---|
| `fleetClass` | `none` |
| `homeSectors` | `[]` |
| `shipRoleCount` | `0` |
| `zoneFactionOwnedCount` | `0` |
| `zonePresenceFactionCount` | `0` |
| `option1Allowed` | `false` |
| `option2Allowed` | `false` |
| `productSafePath` | `option3_fail_closed` |
| `fableSpawnPolicy` | `missing_§5.7` |

Machine report: `.devshots/depth-program/d1-living-opposition.json`  
Implementer log: `implementer/living-opposition.log`

## 6) REAL residual (Helix)

| Claim | Truth |
|---|---|
| Original-nine doctrine tags on natural ambient | **Green** |
| Helix natural fleet carrier (`helixCarrierCount ≥ 1`) | **Missing — proven impossible under current data + policy gap** |
| Option 1 / 2 | **Blocked by shipped data** (not merely deferred preference) |
| Blocker authority | Fable §5.7 spawn-policy still unwritten; paper fleet row still `fleetClass:'none'` |
| Fail-closed proof | `FORCE_HELIX_CARRIER=1 npm run check:depth-program:d1:living-opposition` → assertion failure with blocker JSON |

Do **not** claim F0 task 8 fully closed until Helix carriers land under a signed policy **and** product data authorizes presence/fleet.

### What Fable §5.7 must decide (for next product slice)

1. Budget class for Helix (lazy vs ambient allotment; golden protection recipe 47a).
2. Whether Helix stays paper forever vs gains a real fleet class + hulls.
3. Sector-danger / home-sector gating if presence is invented.
4. Despawn contract and contact identity (true Helix vs false-flag MTS/Reach).
5. Whether doctrine stamp alone is enough or ROE/combat doctrine ownership must follow.

## 7) Explicit non-goals

- Helix zone authoring / lazy Helix fleets  
- encounterDirector density retune  
- Golden re-record  
- Assets / thrusters / graphics  
- design/program status stamps  
- Commit  
- Fake-green Helix by mislabeling other factions

## 8) Charter block

```
LIVE AUDIT: F0 task 8; G_V2_D1_STATUS; FACTION_DOCTRINES; factions/helix.js paper row; sectorZones full scan (0 Helix ownership); world stampFactionDoctrineTag; no Fable §5.7 ruling on disk.
DIFF SUMMARY: scripts/check-depth-program-d1-living-opposition.mjs (helix blockers + stronger FORCE_HELIX fail); G_D1_LIVING_OPPOSITION.md; FABLE_HELIX_RESIDUAL.md; implementer/living-opposition.log; no world.js / spawn / asset edits.
GATES: check:depth-program:d1:living-opposition GREEN (4/4 doctrine-tagged soaks; helixCarrierSoaks=0; productSafePath=option3_fail_closed). FORCE_HELIX_CARRIER=1 RED (honest REAL residual with blocker payload).
FAILURE CLASS: N/A for original-nine ambient tags. Helix carriers = REAL residual proven impossible under current data (options 1–2 blocked) + policy gap — not fake green.
PLAN DRIFT: none vs prefer-small-product fence; no thrusters/assets; no spawn-budget thrash; no invented Helix presence.
RESIDUAL: Helix natural fleet carriers only after §5.7 + non-paper presence/fleet data; optional full factionPresenceDoctrine ROE stamp on ambient (behavior-path, higher golden risk).
```
