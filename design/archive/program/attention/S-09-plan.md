# S-09 plan — Veil Nebula (tribunal synthesis)

Scored on the ATTENTION rubric; Archivist's eight-plate spine spliced with the Skeptic's
sightings lines and the Set Dresser's cult/hail texture.

| Axis | Archivist | Skeptic | Set Dresser |
|------|-----------|---------|-------------|
| Critical-path weight | 4 | 4 | 3 |
| Authenticity | 5 | 5 | 5 |
| Specificity | 5 | 4 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 5 (fills empty records) | 4 | 4 |

## Landed plan
1. `src/data/sectors.js` — `discoveryPlate` on eight POIs: `poi_wormhole`,
   `poi_veil_far_sounding`, `poi_veil_quiet_ice`, `poi_veil_survey_monolith`,
   `poi_veil_revoked_gate`, `poi_veil_black_orchard`, `poi_veil_containment_ring`,
   `poi_veil_exception_chamber`. Bodies consistent with zone reasons; each phenomenon keeps a
   distinct voice (no obelisk-voice duplication).
2. `src/data/flavor/040-band.js` — +3 `numbers_station` (`numbers_64`-`66`, sightings format)
   and +2 `choir_vespers` (`vespers_61`-`62`, fog-as-liturgy). Plain lines only.
3. `src/data/contactHail.js` — +1 `faction_vael` neutral line (the obelisk patrol's filed
   arrival) and +1 `faction_free` allied line (the research station's instruments-first
   hospitality).
4. No barks changes — Veil's threat presence is vael, and the vael corpus is this row's
   neighbor's (S-10) surface; duplicating it here fails non-redundancy.

## Not landing (rejected at tribunal)
- `hush` additions — the pack is hardbound to `planet_hush` in Eunomia Gulf (`v2FlavorRuntime`
  HUSH constants); Veil silence would be a second site under a first site's schema.
- Obelisk edits — already plated, already a bleed carrier, already landmark lore.
- `rim_poi_lore` — no runtime consumer.
- A veil-cult faction or NPC — new machinery, out of scope.

## Approvals
- Author: implementer (this unit). Tribunal synthesis recorded above; per the row's
  single-agent instruction, three-persona drafts are in S-09-drafts.md.
