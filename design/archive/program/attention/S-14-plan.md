# S-14 plan — Frontier regions, first five (tribunal synthesis)

Split honored: Hyperion Cut, Dione Lane, Eris Margin, Eunomia Gulf, Haumea Rift only
(5 of 14 — ledger row records the split). Per region: +2 field-edge/wayline finds
(card `pois:` + `anchors.pois:`), plates in the region's own station voice. Plus the
in-scope S-13 memorial POIs (same files, credited there).

| Axis | Drifter | Archivist | Skeptic |
|------|---------|-----------|---------|
| Critical-path weight | 4 | 3 | 4 |
| Authenticity | 5 | 5 | 4 |
| Specificity | 4 | 5 | 4 |
| Cost | 5 | 5 | 5 |
| Non-redundancy | 4 | 4 | 5 |

## Landed plan

**Hyperion Cut** (`west.js`):
- `poi_hyperion_stake_line` beacon `place_claim_mark` vr5 at (440,-580) — off f_hyperion_1
  (380,-640 r460). Claim-crew shorthand plate; the Cut is a worked cut.
- `poi_hyperion_tag_face` beacon `place_asteroid_graffiti` vr16 at (-760,280) — off
  f_hyperion_2 (-820,220 r400). The mark the drill crews left before the cave.

**Dione Lane** (`south.js`):
- `poi_dione_convoy_tally` beacon `place_tally_post` vr9 at (-400,470) — off f_dione_1
  (-320,540 r420). Manifest voice; convoys waited out customs against this seam.
- `poi_dione_way_tag` beacon `place_asteroid_graffiti` vr16 at (-260,620) — same field's
  quiet edge. The lawful lane's neater graffiti.

**Eris Margin** (`north.js`):
- `poi_eris_watch_pin` derelict `place_ash_pin` vr6 at (600,-360) — off f_eris_1
  (540,-420 r450). Quiet register; a pin watching nothing on purpose.
- `poi_eris_mark_stone` beacon `place_asteroid_graffiti` vr16 at (-420,-820) — off
  f_eris_2 (-480,-880 r400). Its plate says the real filing is somewhere else.

**Eunomia Gulf** (`south.js`):
- `poi_eunomia_gulf_stake` beacon `place_claim_mark` vr5 at (260,330) — off f_eunomia_1
  (200,380 r400). License-stamp register.
- `poi_eunomia_lamp_row` derelict `place_worklight_tower` vr12 at (940,760) — off
  f_eunomia_2 (1000,700 r400, "licensed plate drift"). Salvage-yard lamp line.

**Haumea Rift** (`north.js`):
- `poi_haumea_frost_tag` beacon `place_asteroid_graffiti` vr16 at (-320,470) — off
  f_haumea_1 (-380,520 r460). Observatory crews' bored mark; instrument register.
- `poi_haumea_listen_pin` beacon `place_nav_buoy` vr10 at (800,300) — off f_haumea_2
  (860,240 r400). A dropped receiver the observatory lost paperwork on.

Each: `Object.freeze` card row ({id, type, name, discoveryPlate}) + `Object.freeze`
anchor row ({id, pos, landmarkGlb, visualRadius}). No landmark flags, no collides,
no zones, no fields, no stations.

## Not landing (rejected at tribunal)
- Other nine regions — split is explicit (5/14); their turn is the row's next claim.
- Station chartNote edits — count pinned at 17.
- The foreign `poi_haumea_fissure.landmarkGlb` hunk — untouched, preserved.
- New zones/hazards/fields — each region already carries named zones; fields are economy.

## Test
`node --test test/m2b-frontier-south.test.mjs` — POI whitelist, anchor coverage,
zone contract for the two south regions (and a west/north run of the same family if
context allows).

## Approvals
Tribunal synthesis recorded above (Drifter + Archivist + Skeptic in S-14-drafts.md).
Single-agent unit per the row instruction; ledger status `in-review (5/14 regions)`.
