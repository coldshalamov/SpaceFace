# S-11 plan — Asteroid fields (tribunal synthesis)

Splice of Drifter (shift-log finds) + Archivist (filing-mark plates), budgeted by the
Skeptic: 16 new field-edge POIs across the 10 core sectors, each a card row + anchor row,
each carrying a discoveryPlate in the claim-culture register. All non-colliding dressing —
zero sim delta, pool-neutral (plated POIs are mark-ineligible by existing rule; nothing
existing loses eligibility).

| Axis | Drifter | Archivist | Skeptic |
|------|---------|-----------|---------|
| Critical-path weight | 4 (finds ride the scanner/chart) | 3 (first-discovery, once) | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 (filing marks, crew tags) | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 5 | 5 (fields are literally bare) | 5 |

## Landed plan
`src/data/sectors.js` — append to each core sector's `pois:` (inside existing arrays,
outside the foreign `appendSectorWonderPois` hunks):

| sector | new POI (type, prop, anchor pos near authored field) |
|--------|------------------------------------------------------|
| helios | `poi_helios_seam_tag` beacon `place_asteroid_graffiti` vr16 (-780,700) off f_helios_outer |
| ceres  | `poi_ceres_shaft_seven` beacon `place_claim_mark` vr5 (-600,300) off f_ceres_2; `poi_ceres_three_lamp` derelict `place_worklight_tower` vr12 (500,-650) off f_ceres_1 |
| tethys | `poi_tethys_braid_tally` beacon `place_tally_post` vr9 (-460,620) off f_tethys_1 |
| vesta  | `poi_vesta_cold_line` derelict `place_drill_platform_cold` vr24 (740,260) off f_vesta_2; `poi_vesta_gallery_rock` beacon `place_asteroid_graffiti` vr16 (180,940) off f_vesta_3 |
| pallas | `poi_pallas_faith_stake` beacon `place_claim_mark` vr5 (-260,-560) off f_pallas_1; `poi_pallas_tag_drift` beacon `place_asteroid_graffiti` vr16 (920,480) off f_pallas_2 |
| io     | `poi_io_quiet_mast` derelict `place_pirate_sensor_mast` vr14 (600,-420) off f_io_1; `poi_io_burn_stake` derelict `place_ash_pin` vr6 (-1120,-260) off f_io_2 |
| charon | `poi_charon_reader_stake` beacon `place_claim_mark` vr5 (1060,340) off f_charon_2; `poi_charon_slurry` derelict `place_slurry_tank` vr16 (-920,-480) off f_charon_3 |
| sker   | `poi_sker_tally_wall` beacon `place_tally_post` vr9 (660,-360) off f_sker_1; `poi_sker_marked_rock` beacon `place_asteroid_graffiti` vr16 (780,-480) off f_sker_1 |
| veil   | `poi_veil_murmur_buoy` beacon `place_nav_buoy` vr10 (-340,580) off f_veil_1; `poi_veil_choir_tag` beacon `place_asteroid_graffiti` vr16 (-220,700) off f_veil_1 |
| ashfall| `poi_ashfall_kurtz_mark` beacon `place_claim_mark` vr5 (700,-220) off f_ash_1; `poi_ashfall_burn_lamp` derelict `place_worklight_tower` vr12 (-1060,-860) off f_ash_2 |

`src/data/sectorAnchors.js` — append matching `{id, pos, landmarkGlb, visualRadius}` rows
to each sector's `pois:` anchor block.

All plates: title 3–48, body 60–420 chars, claim-culture register (filing marks, lapse
lines, crew tags — "SHAFT 7", "RU-7", the SPAN-HOLD precedent).

## Not landing (rejected at tribunal)
- `boulders` entries on field rows — authored boulders change ore yields: economy delta.
- `collides: true` on dressing props — physical obstruction is gameplay.
- Flavor-pack edits (graffiti/ad_board exact counts), new zones, new hazards.
- Frontier fields — that's S-14's surface (same mechanism, region files).

## Test
`node --test test/sector-geography.test.mjs` — the pos/anchor contract for the new POIs.

## Approvals
Tribunal synthesis recorded above (Drifter + Archivist + Skeptic drafts in
S-11-drafts.md). Single-agent unit per the row instruction.
