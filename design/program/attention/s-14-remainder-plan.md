# S-14 remainder plan — the nine undressed frontier regions

Second half of ledger row S-14. The first five regions (Hyperion Cut, Dione Lane,
Eris Margin, Eunomia Gulf, Haumea Rift) shipped @ 1312cc53bb; this pass dresses the
remaining nine with the proven pattern: two field-edge POIs per region — a card row
(`{id, type, name, discoveryPlate}`) plus a matching `anchors.pois` row
(`{id, pos, landmarkGlb, visualRadius}`) — and one `rim_poi_lore` entry per POI
(three-plus fragments, pack-unique line ids). Every new POI carries a
`discoveryPlate`, so the whole batch is mark-ineligible: zero bounty-pool delta,
same contract as the first five. Positions sit at authored field rims (each anchor
row notes its field, center, and radius in comment, same as the landed batch).
Numbering continues the ledger row's 14-region order.

**Kepler Scar (6/14, west.js)** — the Reach fence under the capsized Void-Reach:
the Bazaar prices in favors and enforces in tow-lines. `poi_kepler_price_post`
(beacon, `place_tally_post`, vr9) at (744,-356) off f_kepler_1's exotic rim — the
stall tally that marks rock already spoken for. `poi_kepler_tow_marks` (beacon,
`place_asteroid_graffiti`, vr16) at (-916,344) off f_kepler_2 — the enforcers'
scorch ledger, one line per late payer.

**Nereid Shoal (7/14, east.js)** — Free Frontier waystation plus a Collective-cut
claim desk; the salvors' law is that the rime keeps the count.
`poi_nereid_rime_board` (beacon, `place_tally_post`, vr9) at (484,-576) off
f_nereid_1's icy rim — claim-lines scratched through the same rime.
`poi_nereid_independent_flag` (beacon, `place_claim_mark`, vr5) at (-856,444) off
f_nereid_2 — a hand-sewn signature under the Collective cut.

**Nyx March (8/14, west.js)** — the Quiet fence's register: deniable, terse,
inverted. `poi_nyx_dark_lantern` (beacon, `place_worklight_tower`, vr12) at
(484,-716) off f_nyx_1's icy rim — a lantern that burns backwards: lit means
watched, dark means run it. `poi_nyx_forged_stakes` (beacon,
`place_claim_mark`, vr5) at (-576,384) off f_nyx_2 — claim stakes filed under a
registry that exists nowhere else.

**Orcus Shadow (9/14, west.js)** — the deep dark where the Vael measure rather
than claim, and the Broken Shepherd's unherded flock drifts on f_orcus_3.
`poi_orcus_measure_stake` (beacon, `place_ash_pin`, vr6) at (784,-216) off
f_orcus_1's exotic rim — an instrument pin whose scan tally increments unwatched.
`poi_orcus_shepherd_tag` (derelict, `place_asteroid_graffiti`, vr16) at (1096,-796)
off f_orcus_3 — a herder's tag wired to the lead rock, delivery bearing ending at
the signal's throat.

**Phoebe Echo (10/14, north.js)** — the Shard Sphere's song and the shrine's
discipline. `poi_phoebe_struck_face` (beacon, `place_asteroid_graffiti`, vr16) at
(836,-756) off f_phoebe_3's singing-crystal rim — test-strike scars in a pattern
that is almost a scale. `poi_phoebe_listener_post` (beacon, `place_nav_buoy`,
vr10) at (-816,-176) off f_phoebe_2's gas edge — the keeper's two columns: came
to listen, came to take.

**Proteus Well (11/14, east.js)** — the Quiet den at the well-mouth, violet
guide strips, single-file throats. `poi_proteus_strip_marks` (beacon,
`place_asteroid_graffiti`, vr16) at (740,-364) off f_proteus_1's metallic rim —
same violet hand as the Funnel's strips; a stone wearing it is spoken for.
`poi_proteus_bearer_post` (beacon, `place_cold_locker`, vr11) at (-1016,-576) off
f_proteus_2 — where bearer cases stage; the chalk marks who is owed, nothing else.

**Rhea Cinder (12/14, north.js)** — scorched ore, thin escort, Reach ambushes on
the Sker approach. `poi_rhea_assay_board` (beacon, `place_tally_post`, vr9) at
(544,-256) off f_rhea_1's metallic rim — scorched assays pinned in sale order,
buy the read then the rock. `poi_rhea_escort_tally` (beacon,
`place_asteroid_graffiti`, vr16) at (-856,-576) off f_rhea_2 — hauler marks in
one column, escort marks in a shorter one.

**Sedna Dark (13/14, south.js)** — the darkest post: no fuel, no rescue, dead
lane buoys strung on the unlit reach. `poi_sedna_buoy_ledger` (beacon,
`place_tally_post`, vr9) at (-86,-1086) off f_sedna_2's dead-buoy drift — buoy
numbers and dark dates, recovery notes reading "left in place."
`poi_sedna_survey_etch` (beacon, `place_asteroid_graffiti`, vr16) at (656,-216)
off f_sedna_1 — grid lines and a return date three seasons old, etched for a
crew that isn't coming.

**Triton Wake (14/14, east.js)** — the departed star's wake and the Archive
field lab's instruments. `poi_triton_drift_log` (beacon, `place_nav_buoy`, vr10)
at (-916,-316) off f_triton_3's wake-debris rim — logging how fast dead metal
still travels. `poi_triton_abandoned_survey` (derelict, `place_ash_pin`, vr6) at
(876,344) off f_triton_2 — half a survey grid: stake holes, one bearing line,
no completion stamp.

Files touched: `src/data/frontierRegions/{west,north,east,south}.js`,
`src/data/flavor/100-rim-poi-lore.js`. No zones, fields, stations, hazards, or
machinery — additive tail appends inside existing arrays only.
Tests: `node --test test/pulse-volume-fill.test.mjs test/m2b-frontier-west.test.mjs
test/m2b-frontier-north.test.mjs test/m2b-frontier-east.test.mjs
test/m2b-frontier-south.test.mjs test/depth-program-flavor-loader.test.mjs`.
