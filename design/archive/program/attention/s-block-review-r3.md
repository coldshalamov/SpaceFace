# S-block review — ROUND 3 of 3 (independent re-verification, last gate)

Reviewer: round-3 subagent. Did not trust round 1 or round 2; re-ran every gate against
the live working tree (sweep `d13289ff70` on master + foreign S-13 commit `a4b1d30836`
+ dirty hunks). Specifically re-verified the r2 PULSE-07 repair before trusting it.

## Gates run (this sitting, live tree)

- `node --test test/sector-geography.test.mjs test/pulse-08-barks.test.mjs
  test/depth-program-flavor-loader.test.mjs test/voice-corpus-coverage.test.mjs
  test/discovery-plate.test.mjs test/the-bolus.test.mjs
  test/content-variety-append.test.mjs test/pulse-volume-fill.test.mjs
  test/inf-landmark-discovery-plates.test.mjs` → **41/41 pass, 0 fail**, including both
  PULSE-07 halves ("every landmark lore entry has ≥3 lines", "every authored rim POI id
  has a lore entry with ≥3 lines") — the gate that was red on master at r2.
- `node scripts/check-sector-geography.mjs` → **493 ok, 0 fail** (25 sectors).
- `node scripts/check-flavor-corpus.mjs` (exists; run) → **OK: 10 packs, 2190 lines,
  13 wreck rumor sources, 153 indexed sources, 519 Band tickers, 95 landmark fragments.**

## r2 fix re-verification (S-05 / S-13 / S-14) — holds

All 21 appended entries exist at `src/data/flavor/100-rim-poi-lore.js:536–748`, one
contiguous tail-of-array block after `dione_dead_drop` (insertion `@@ -432,0 +433,316 @@`,
array still closes at file end — index-0 / first-12 untouched).

- **Bind to real poiIds** — every `location.poiId` resolves in the loaded, anchor-applied
  `SECTORS` (verified by enumerating `sector.pois`, not by string search): the 3 Pallas
  POIs in `sector_pallas_drift`, the 8 memorial POIs in their correct frontier sectors
  (nyx_march/rhea_cinder/haumea_rift/eris_margin/nereid_shoal/triton_wake/eunomia_gulf×2),
  the 10 S-14 POIs in their named regions.
- **≥3 lines each** — all 21 carry exactly 3 lines; pack-wide scan shows 73 entries /
  219 line ids, zero duplicate entry ids, zero duplicate line ids, zero entries <3 lines.
- **Region register** — S-05 entries speak the drift's register (kept mooring, den
  doorbell, mess line; "silence is a complete sentence"); S-13 entries are the eulogy
  register with real named dead (Toma Reye; Pall Vess + Nera Oku; Ansi Toro + Bes Mar;
  the runner HALKETT; O./K. Ferro; Reva Ils; Pell Osta + S. Reck + the ship's cat) plus
  salvage disposition and kill-mark reads per the Archivist's no-placeholder-dead rule;
  S-14 entries ride each region's own voice (Hyperion's Shaft/Outpost filing shorthand,
  Dione's Meridian customs, Eris's Quiet/Fence, Eunomia's Understory licenses,
  Haumea's Observatory equipment cage).

**Verdict: the r2 fix holds. All three rows stay rejected-THEN-fixed (the fix is real,
verified, and still green) — count continues, does not reset.**

## Corpus laws for the batch (independently re-derived)

- **Mark-blocked only** — replicated `markPoiEligible` (src/data/bountyMarks.js:136)
  over all 228 resolved POIs. All 93 collected new S-block POI ids (dirty hunks + sweep
  `d13289ff70`) are ineligible — every one carries `discoveryPlate`, the anomaly-typed
  ones are also type-blocked. The 8 S-13 memorials: plated beacons, ineligible.
  **Zero new POIs enter the writ pool**; per S-13 plan, the named wrecks keep their
  eligibility (memorials sit beside them, plates not on the wreck rows).
- **Finite positions** — all new POIs resolve finite `pos` in loaded `SECTORS` (inline
  for core, `applySectorAnchors` for frontier, `BOLUS_ANCHORS` for the gut).
- **Unique ids** — 228 resolved POIs, zero duplicate ids.
- **Authored plates** — every new POI has non-empty `discoveryPlate.title` + `.body`.
- **Asset truth** — all 18 `landmarkGlb` names used by new POIs resolve to real GLB
  files on disk (place_tally_post, place_nav_buoy, place_container_rack,
  place_dead_hulk, place_asteroid_graffiti, place_claim_mark, place_ash_pin,
  place_worklight_tower, place_debris_chunk, place_cargo_pod_standard,
  place_drill_platform_cold, place_lane_pin, place_cold_locker, place_whistle,
  place_pirate_sensor_mast, place_memorial_array, place_slurry_tank,
  place_gate_jump_ring).
- **One-sentence lines** — all 68 added bark/hail lines across `contactHail.js` +
  `barkSituationFill.js` carry ≤2 sentence enders; zero violations. Corpus shape gates
  (PULSE-08 ≥12/cell, voice-corpus ≥3/stance cell) green.
- **Ordering** — every flavor/hail mutation is a tail-of-array append with continuing
  ids (concord_61–64 after _60, c\*_05 after _04, hail lines after last line per cell).
- **Additive-only** — dirty numstat: zero `-` lines on sectors.js, theBolus.js,
  frontierRegions/{west,north,south}.js, 040-band, 080-landmark-lore, 100-rim-poi-lore,
  contactHail. `barkSituationFill.js` shows 64+/28− — every removed line sits inside a
  `distress:` cell (verified by hunk context): the declared foreign lane's rewrites.
  Committed `a4b1d30836` (S-13): 146+/2−, both deletions in ledger/board status rows.
- **the-bolus.test.mjs dirty edit** — S-15's own pinned-count update (zones 3→4 for the
  Nursery, commented); the assert stays fail-closed on the new count. Legitimate.
- **Stat-cache ghosts** — `020-ad-board.js`, `030-graffiti.js`,
  `depth-program-flavor-loader.test.mjs` showed `M` with empty diffs; `git update-index
  --refresh` cleared them (content identical to HEAD). Not content changes.

## Plan-vs-diff spot reads (3 fresh + 2 re-confirmations)

- **s-05-plan** vs dirty hunks: all 5 Pallas POIs exact — mess_line (derelict,
  container_rack, 900,-1100), sker_ward (beacon, nav_buoy, -1400,2100), eighteenth
  (beacon, lane_pin, -1100,-1550), off_books (derelict, cold_locker, 250,1350),
  quiet_bell (beacon, whistle, -950,700); +1 quiet scan +2 quiet patrol-greeting;
  numbers_67/68 (mooring + bell); 3 lore entries (see fix verification). **Full match.**
- **S-11-plan** vs resolved data: all 18 field-edge POIs match type/GLB/visualRadius/
  anchor pos exactly across the 10 core sectors, each plated. **Full match.**
- **S-15-plan** vs dirty theBolus.js: poi_bolus_manifest (derelict, dead_hulk, 1700,820 —
  inside Cough zone, ~128 WU off center, r700), poi_bolus_rib_watch (beacon, nav_buoy,
  -880,-780, vr10), charon_buoy plate, zone_bolus_nursery (anomaly_deep, faction_free,
  -560,-400 r300 — matches bolusPlay nurseryX/Z). **Full match.**
- **S-12-plan** (re-confirmation): exactly the 12 `c*_05` fifth beats named in the plan
  (c2,c4,c6,c7,c8,c9,c10,c13a,b,c,e,c15) on the under-filled entries; 19 unique c*_05
  ids in file (7 prior + 12 new); 4 pilgrim POIs verified with plan GLBs/vr/pos.
- **S-14-plan** (re-confirmation): all 10 POIs exact per plan table; 5/14 split honored
  (Hyperion/Dione/Eris/Eunomia/Haumea only; foreign `poi_haumea_fissure` untouched).

## Per-row verdicts

| Row | Verdict | Notes |
|-----|---------|-------|
| S-01 Helios Prime | **APPROVE** | 4 POIs exact (shift_bell/tally_post, misdeclared/nav_buoy, lost_freight/container_rack, overtime/dead_hulk — all plated); concord_61–64; ad_pulse_306–309 helios/scn; 5 scn bark fills with S-01 comments. |
| S-02 Ceres Belt | **APPROVE** | 6 POIs in sweep (claim_tag, vigil, lapsed_cache, restake, ash_pin, short_ration) + lore entries ceres_claim_tag/ceres_vigil/ceres_lapsed_cache verified present in pack; ballad_64–67; DMC fills. |
| S-03 Tethys Junction | **APPROVE** | 5 POIs (marshal_nine, refiled, refused, second_count, formup); routing_61–62 + static_68–69 (S-03-named lines); mts fills. |
| S-04 Vesta Forge | **APPROVE** | 7 POIs (guild_stamps, hot_face, kilnward, lead_hedge, reject_run + S-11 pair); vespers_63–65; dmc forge lines. |
| S-05 Pallas Drift | **APPROVE** (r2 rejected-then-fixed holds) | Full plan match incl. the r2-appended lore tranche — verified binding/register above. |
| S-06 Io Reach | **APPROVE** | listening_field, shepherds_ring, quiet_mast, burn_stake, cathedral_vigil all plated/resolved; static_61–63; quiet hails. |
| S-07 Charon Expanse | **APPROVE** | 10 POIs incl. world-site nursery plates + tether_memorial (S-13 core); numbers_61–63; ballad_61–62. |
| S-08 Sker Haven | **APPROVE** | 8 POIs (null_causeway, quiet_dock, red_snow, tally_wall, marked_rock, penance_moor, harvest_deep, bounty_tally); static_64–65; reach hails. |
| S-09 Veil Nebula | **APPROVE** | 7 row POIs (black_orchard, containment_ring, exception_chamber, far_sounding, quiet_ice, revoked_gate, survey_monolith) + S-11 pair (murmur_buoy, choir_tag) — all plated/resolved; numbers_64–66; vespers_61–62. |
| S-10 Ashfall Reach | **APPROVE** | 12 POIs incl. kurtz_mark/burn_lamp/keykeeper; static_66–67; ashfall graffiti set tag_loc_100–109 confirmed in committed pack. |
| S-11 Asteroid fields | **APPROVE** | All 18 POIs exact vs plan (see spot-read). |
| S-12 Landmarks | **APPROVE** | 12 c\*_05 beats exact vs plan; 4 pilgrim POIs verified; pinned counts honored. |
| S-13 Debris/wreck fields | **APPROVE** (r2 rejected-then-fixed holds) | Foreign `a4b1d30836` additive; 8 memorials resolve/beacon/plated; 2 core memorials (tether, bounty_tally) in sweep; r2's 8 lore entries verified. |
| S-14 Frontier (5/14) | **APPROVE** (r2 rejected-then-fixed holds) | 10 POIs exact vs plan; r2's 10 lore entries verified per-region register. |
| S-15 The Bolus | **APPROVE** | Plan-vs-diff full match (see spot-read); zone-pin update is the unit's own. |

## Foreign noise observed, not rejectable

Dirty tree throughout; foreign distress-cell rewrites in barkSituationFill.js; foreign
test-file churn (encounters rewrites, massline, black-flag, crucible, untracked _dbg
files); other attention rows' untracked catalog/draft/plan artifacts interleaved in the
same artifact dir; stat-cache ghosts on three S-block-adjacent files (cleared, no
content delta). Foreign reds (unused-model-live-wire, pq146-narrative, massline-tow)
are outside the assigned suite and unchanged by this block.

## Batch verdict

**APPROVE — round 3 of 3. APPROVED FOR LANDING.**

Three independent gates, three successive approvals: r1 self-audit (493/493, 32/32),
r2 independent re-verify with three real defects found and fixed, r3 full re-derivation
confirming the r2 repairs hold and finding no new defect. Every corpus law re-derived
from code against the resolved data, not trusted from prior verdicts. The block is
additive-only, plate-complete, mark-pool neutral, id-unique, and register-true.
