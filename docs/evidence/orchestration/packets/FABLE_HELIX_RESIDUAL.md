# Fable re-pin packet: Helix living opposition residual

**Date:** 2026-07-17  
**Spine:** `SpaceFace-depth-actualization` / `grok/depth-player-route-actualization` ~`6475e2ef+`  
**Gate:** `npm run check:depth-program:d1:living-opposition`  
**Fail-closed:** `FORCE_HELIX_CARRIER=1 npm run check:depth-program:d1:living-opposition` (must RED)

## REAL claim

Helix has **no** natural zone/fleet carrier in ordinary crowded-sector play.

D1 soak proves **original-nine** FACTION_DOCTRINES tags on ambient hostiles (green).  
`helixCarrierCount=0` on every soak (honest residual, not waived).

## Product-safe option audit (Grok residual)

| Option | Result | Why |
|---|---|---|
| 1 Stamp Helix doctrine on existing ambient if Helix owns a zone | **BLOCKED** | 0 zones with `factionId`/`presence.factionId` = `faction_helix` |
| 2 Authored ambient Helix patrol if Helix has presence | **BLOCKED** | `helix.js`: `fleetClass:'none'`, `homeSectors:[]`, `shipRoles:[]`, personality paper |
| 3 Fail-closed residual; do not fake green | **TAKEN** | Only safe path without §5.7 + non-paper data |

### Explicitly rejected (would be fake green)

- Stamping Helix doctrine onto MTS/Reach contacts (lore false-flag ≠ product identity)
- Inventing Helix zones/patrols without fleet class / homeSectors
- Spawn-budget thrash without Fable policy
- Default-green Helix waiver

## Request to Fable (§5.7)

Please rule spawn-policy for Helix carrier class **before** any product spawn-budget / encounterDirector / zone-presence change:

1. Budget class (lazy vs ambient; golden protection)
2. Paper forever vs real fleetClass + hulls
3. Sector-danger / home-sector gating
4. Despawn + contact identity (true Helix vs false-flag)
5. Doctrine-only stamp vs full ROE ownership

## Evidence pointers

- Return: `docs/evidence/orchestration/returns/G_D1_LIVING_OPPOSITION.md`
- Check report: `.devshots/depth-program/d1-living-opposition.json` (`helixBlockers`)
- Log: `implementer/living-opposition.log`
- Data: `src/data/factions/helix.js`, `src/data/sectorZones.js`, `src/data/factionDoctrines.js` (`helix_controlled_escalation`)
