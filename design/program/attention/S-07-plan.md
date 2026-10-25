# S-07 plan — Charon Expanse (tribunal synthesis)

Scored on the ATTENTION rubric; Archivist's full plate coverage spliced with the Skeptic's
radio-ghost lines and two of the Drifter's lonely ballads.

| Axis | Drifter | Archivist | Skeptic |
|------|---------|-----------|---------|
| Critical-path weight | 4 | 4 (nine one-time discovery moments) | 4 |
| Authenticity | 4 | 5 | 5 |
| Specificity | 4 | 5 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 5 (fills empty journal bodies) | 4 |

## Landed plan
1. `src/data/sectors.js` — `discoveryPlate` on nine POIs: `poi_charon_tether_wreck`,
   `world_site_charon_cinder_nursery`, `poi_charon_warm_freighter`, `poi_charon_hull_garden`,
   `poi_charon_pylon_field`, `poi_charon_star_marker`, `poi_charon_broken_shepherd`,
   `poi_charon_preserved_cockpit`, `poi_charon_empty_skin`. Bodies consistent with the zone
   reasons in `authoredPlaces.js`; eerie register, spare sentences.
2. `src/data/flavor/040-band.js` — append three `numbers_station` lines (`numbers_61`-`63`,
   Charon ghosts: the Lung's accounting, the bedlight answer) and two `ballad_line` lines
   (`ballad_61`-`62`, tether/canister laments). Plain lines only.
3. `src/data/contactHail.js` — +1 `faction_dmc` line per stance: refinery-shift register
   ("already logged your trail", "ore prices are down, patience too", "the good board").
4. `src/data/barks.js` — +2 `faction_dmc` base lines (`patrol-greeting`, `warn`): blue-collar
   lane law.

## Not landing (rejected at tribunal)
- Plate on `poi_colony` — claimable colony is in the sector's bounty-writ pool; plating removes
  it. The beacon and colony keep their existing surfaces (rim lore, landmark bleed carrier).
- `rim_poi_lore` additions — pack is catalogued but has no runtime surface; silent text.
- `graffiti`/`ad_board` — exact-count contracts; the station walls are already written anyway.
- Any new encounter or zone — new machinery, out of scope.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in S-07-drafts.md.
