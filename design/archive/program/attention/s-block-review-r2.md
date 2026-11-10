# S-block review — ROUND 2 of 3 (independent re-verification)

Reviewer: round-2 subagent. Did not trust round 1; re-ran everything against the
live working tree (sweep `d13289ff70` on master + dirty hunks).

## Gates run

- `node --test test/sector-geography.test.mjs test/pulse-08-barks.test.mjs
  test/depth-program-flavor-loader.test.mjs test/voice-corpus-coverage.test.mjs
  test/discovery-plate.test.mjs test/the-bolus.test.mjs
  test/content-variety-append.test.mjs` → **32/32 pass, 0 fail**
- `node scripts/check-sector-geography.mjs` → **493 ok, 0 fail** (25 sectors)
- `node --test test/pulse-volume-fill.test.mjs` → **6/6 pass** (was RED before my
  fix — see S-13/S-14 below)

## Corpus laws verified independently

- **Mark-blocked only** — replicated `markPoiEligible` (src/data/bountyMarks.js:136)
  over all 228 sector POIs + 10 frontier + 2 bolus additions. Every S-block POI is
  bounty-ineligible: all carry `discoveryPlate`, and the S-10 anomalies are also
  type-blocked. Zero new POIs enter the writ pool. (The 27 still-eligible POIs are
  all pre-existing geography — none are S-block.)
- **Finite positions** — all new POIs resolve finite `pos` in the loaded `SECTORS`
  (inline for core, via `applySectorAnchors` for frontier, `BOLUS_ANCHORS` for bolus).
- **Unique ids** — 228 sector POIs, zero duplicates; new lore/line ids unique
  (catalog `validateCopyShape` throws on collision — loader test green).
- **Authored plate prose** — every new POI carries a non-empty titled plate;
  spot-reads show named, specific, in-register copy (not templates).
- **One-sentence bark lines** — enforced shape (≤2 enders) holds on all gated
  corpora; S-block hails/appends conform. The distress-cell punctuation rewrites
  in `barkSituationFill.js` are the declared foreign lane's, not S-block.
- **Index-0 / first-12 ordering** — every bark/hail/flavor mutation is a tail
  append; index-0 lines untouched; `BARK_SITUATION_FILL` header law honored.
- **Additive-only** — zero `-` lines across sectors.js, theBolus.js,
  frontierRegions/{west,north,south}.js, all five flavor files, contactHail.js.
  barkSituationFill.js's 28 removed lines are all inside `distress:` cells —
  the declared foreign edit. No foreign damage found.
- **Asset truth** — all 11 `landmarkGlb` names used (place_tally_post,
  place_nav_buoy, place_container_rack, place_dead_hulk, place_asteroid_graffiti,
  place_lane_pin, place_cold_locker, place_whistle, place_claim_mark,
  place_ash_pin, place_worklight_tower) resolve to real GLBs already used by
  shipped POIs.

## Plan-vs-diff spot reads (3)

- **s-02-plan** vs master: all 6 Ceres POIs exact (positions, types, GLBs,
  `cmdty_ore_copper`×3 contents on lapsed_cache); 4 rim-lore entries; DMC
  scan×3 + patrol-greeting×2; ballad_64–67. Full match.
- **S-10-plan** vs master: plates on the nine named anomaly POIs; vael
  warn+demand-cargo+taunt×2, pitborn warn+taunt×2 in barks.js; vael + pitborn
  hostile hails; static_66–67. Match.
- **S-14-plan** vs dirty hunks: all 10 POIs + anchors land verbatim per plan
  (ids, types, GLBs, visualRadii, positions, regions). POI rows match plan —
  but see the gate defect below.

## Per-row verdicts

| Row | Verdict | Notes |
|-----|---------|-------|
| S-01 Helios Prime | **APPROVE** | 4 POIs, concord_61–64, ad_306–309, scn fills; all plated/finite/unique. |
| S-02 Ceres Belt | **APPROVE** | Full plan match (see above). |
| S-03 Tethys Junction | **APPROVE** | 5 POIs, 3 lore entries, mts fills, routing_61–62 + static_68–69. |
| S-04 Vesta Forge | **APPROVE** | 5 POIs, 3 lore entries, dmc forge lines, vespers_63–65. |
| S-05 Pallas Drift | **REJECTED-THEN-FIXED** | Plan's `100-rim-poi-lore` tranche (pallas_eighteenth / pallas_quiet_bell / pallas_mess_line) never landed. Fixed: three entries appended; suite re-green. |
| S-06 Io Reach | **APPROVE** | Plates on shepherds_ring + listening_field; static_61–63; quiet hails ×3 stances; quiet barks +2. |
| S-07 Charon Expanse | **APPROVE** | Plates on 9 POIs incl. world_site_charon_cinder_nursery; numbers_61–63; ballad_61–62; dmc hails/barks. |
| S-08 Sker Haven | **APPROVE** | Plates on 6 POIs; static_64–65; reach hails ×3; reach barks +3. |
| S-09 Veil Nebula | **APPROVE** | Plates on 8 POIs; numbers_64–66; vespers_61–62; vael neutral hail. |
| S-10 Ashfall Reach | **APPROVE** | See spot-read above; +3 extra plated POIs (kurtz/burn/keykeeper) from S-11/S-12 consistent. |
| S-11 Asteroid fields | **APPROVE** | 18 claim/tag POIs across all 10 core sectors, inline pos, plates. |
| S-12 Landmarks | **APPROVE** | 12 `c*_05` scan beats (entry count still pinned at 19); 4 pilgrim POIs. |
| S-13 Debris/wreck fields | **REJECTED-THEN-FIXED** | `a4b1d30836` shipped 8 frontier memorial POIs with no `rim_poi_lore` entries → PULSE-07 gate red on master (`pulse-volume-fill` failing). Fixed: 8 eulogy-register entries appended. |
| S-14 Frontier (5/14) | **REJECTED-THEN-FIXED** | Same PULSE-07 gap: 10 new frontier POIs without lore entries. Fixed: 10 entries appended in each region's register. |
| S-15 The Bolus | **APPROVE** | 2 POIs + charon_buoy plate + nursery zone; manifest pos inside Cough zone verified; bolus tests green. |

## Fixes applied this round (src/data/flavor/100-rim-poi-lore.js, +~130 lines)

21 lore entries appended (pack-local unique ids, fresh line prefixes
pm/qb/ml/rn/sl/pk/tb/sh/wk/ro/pb/st/tf/co/wy/wp/ms/gu/la/ft/lp):
- S-05: `pallas_eighteenth`, `pallas_quiet_bell`, `pallas_mess_line`
- S-13: `nyx_runner_memorial`, `rhea_slag_memorial`, `haumea_probe_memorial`,
  `eris_toll_memorial`, `nereid_shoal_memorial`, `triton_wake_memorial`,
  `eunomia_row_marker`, `eunomia_bed_marker`
- S-14: `hyperion_stake_line`, `hyperion_tag_face`, `dione_convoy_tally`,
  `dione_way_tag`, `eris_watch_pin`, `eris_mark_stone`, `eunomia_gulf_stake`,
  `eunomia_lamp_row`, `haumea_frost_tag`, `haumea_listen_pin`

Re-run after fix: pulse-volume-fill 6/6, assigned suite 32/32, geography 493/0.

## Foreign noise observed, not rejectable

Dirty tree throughout; foreign distress-cell rewrites in barkSituationFill.js
(one-sentence compliance, foreign lane); M-09 fill line and T-01 ad/graffiti
entries interleaved in shared files (additive, other attention rows);
barks.js carries many foreign appends (barkeep/passenger/tourist lanes);
S-13 memorial POIs in the same frontier files S-14 touches (context-preserved).

## Batch verdict

**APPROVE — round 2 of 3.** Round-1's claims verified independently and extended:
the round-1 "493/493 + named tests" picture was accurate but incomplete — it
missed the red PULSE-07 rim-lore gate. All three defect rows were fixed in place
and re-verified; nothing else in the block failed law.
