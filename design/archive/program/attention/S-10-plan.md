# S-10 plan — Ashfall Reach (tribunal synthesis)

Scored on the ATTENTION rubric; splice of Archivist (nine totem plates) + Drifter (challenge
voice tranche) under the Accountant's schema constraints.

| Axis | Drifter | Archivist | Accountant |
|------|---------|-----------|------------|
| Critical-path weight | 5 (hostile barks fire on every raid) | 4 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 | 3 |
| Cost | 4 (base-cell appends shift fill indices) | 5 | 5 |
| Non-redundancy | 4 | 5 | 5 |

## Landed plan
1. `src/data/sectors.js` — `discoveryPlate` on nine anomaly POIs: `poi_ashfall_breathing_dock`,
   `poi_ashfall_gate_underlayer`, `poi_ashfall_ossuary`, `poi_ashfall_black_vault`,
   `poi_ashfall_maintenance`, `poi_ashfall_converted_yards`, `poi_ashfall_towed_moonlet`,
   `poi_ashfall_sterile_zone`, `poi_ashfall_the_line`. Raider-cartography copy consistent with
   the zone reasons.
2. `src/data/barks.js` — `faction_vael` base cells: +2 `taunt`, +1 `warn`, +1 `demand-cargo`
   (clause register with Ashfall-specific references — precedent: the existing scan line's
   "Ashfall relay clause"); `faction_pitborn`: +2 `taunt`, +1 `warn` (yard/kin/blade register).
   Base-array appends preserve every shipped line's index 0..n-1 ordering; fill top-up still
   lands after.
3. `src/data/contactHail.js` — +1 `faction_vael` hostile + +1 `faction_pitborn` hostile
   challenge hails (ALL-CAPS hail register).
4. `src/data/flavor/040-band.js` — +2 `the_static` (`static_66`-`67`): the twice-asked toll
   and the vault's false keyways.

## Not landing (rejected at tribunal)
- `BARK_SITUATION_FILL` additions — inert: every faction cell already saturates at the
  12-line top-up floor; fill lines never land.
- Plates on boss/vault/maw — already plated and journal-verified.
- Graffiti — exact-count contract (365) plus walls already dense.
- New encounters/totem props — new machinery; the register lands through copy.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in S-10-drafts.md.
