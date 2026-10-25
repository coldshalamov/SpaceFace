# S-08 plan — Sker Haven (tribunal synthesis)

Scored on the ATTENTION rubric; Archivist's six-plate coverage spliced with the Set Dresser's
memorial-practical copy direction and the Drifter's band/hail tranche.

| Axis | Drifter | Archivist | Set Dresser |
|------|---------|-----------|-------------|
| Critical-path weight | 4 (band in constant flight rotation) | 4 | 3 |
| Authenticity | 5 | 5 | 5 |
| Specificity | 4 | 5 | 4 |
| Cost | 5 | 5 | 4 |
| Non-redundancy | 4 | 5 | 4 |

## Landed plan
1. `src/data/sectors.js` — `discoveryPlate` on six POIs: `poi_bounty`, `poi_stash`,
   `poi_sker_harvest_deep`, `poi_sker_null_causeway`, `poi_sker_red_snow`,
   `poi_sker_quiet_dock`. Bodies carry the memorial-practical texture (name boards, elders,
   debts) while staying consistent with the zone reasons.
2. `src/data/flavor/040-band.js` — +2 `the_static` (`static_64`-`65`: bunk policy, receipt law),
   +2 `the_margin` (`margin_61`-`62`: four-crew berth, shrine plate donors — no "Tessera",
   so no eventKey needed), +1 `ballad_line` (`ballad_63`: dead welded into the gate).
3. `src/data/contactHail.js` — +1 `faction_reach` line per stance: the vouch/weigh register
   ("vouched for or weighed", "the Bazaar knows your name").
4. `src/data/barks.js` — +3 `faction_reach` base lines (`patrol-greeting`, `taunt`, `warn`):
   Haven toll and name-board specifics.

## Not landing (rejected at tribunal)
- Shrine props / name-board dressing modules — renderer machinery and a dirty foreign file;
  the practice lands as copy instead.
- `poi_sker_throne` plate edits — already plated; do not touch landed copy.
- `rim_poi_lore` — silent pack, no runtime surface.
- `graffiti`/`ad_board` — exact-count contracts; station surfaces are already dense here.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in S-08-drafts.md.
