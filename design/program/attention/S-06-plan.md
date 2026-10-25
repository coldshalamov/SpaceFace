# S-06 plan — Io Reach (tribunal synthesis)

Scored on the ATTENTION rubric; splice of Archivist (discovery records) + Drifter/Set Dresser
(radio and hail voices), keeping the Drifter's warm work-talk with one Set Dresser edge line.

| Axis | Drifter | Archivist | Set Dresser |
|------|---------|-----------|-------------|
| Critical-path weight | 4 (band plays in flight constantly) | 3 (first-discovery moment, once per site) | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 (named receivers, dead relay) | 3 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 5 (fills a literally empty journal body) | 4 |

## Landed plan
1. `src/data/sectors.js` — `discoveryPlate {title, body}` on `poi_io_shepherds_ring` and
   `poi_io_listening_field`. Bodies stay consistent with the zone `reason` strings already
   authored in `authoredPlaces.js` (containment ring; seven receivers).
2. `src/data/flavor/040-band.js` — append three lines to `the_static` (`static_61`-`static_63`):
   contested board, outpost vetting, air-share pay. No `repBand` (order asserted in the loader
   test), no `eventKey`.
3. `src/data/contactHail.js` — +1 line per stance on `faction_quiet` (the contracting post's
   vetting voice) and `faction_free` (contested-floor voice). House register stays ALL-CAPS.
4. `src/data/barks.js` — +2 `faction_quiet` base lines (`patrol-greeting`, `taunt`), terse
   counting register. Base-array append keeps index 0 and all earlier shipped indices stable.

## Not landing (rejected at tribunal)
- Plates on `poi_merc` / `poi_claim_pallas` — both are bounty-mark-eligible; `discoveryPlate`
  would remove them from the writ pool (`markPoiEligible`). Real gameplay delta for flavor gain.
- `rim_poi_lore` entries — the pack has no runtime consumer; text nobody reads is not detail.
- `graffiti`/`ad_board`/`landmark_lore` — exact-count test contracts; off this row's budget.
- New zones/props — new machinery, explicitly out of program scope.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in S-06-drafts.md.
