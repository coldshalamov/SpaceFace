# S-14 remainder review — ROUND 2 of 3 (independent verification)

Reviewer: round-2 subagent. Did not trust the authoring pass; re-derived every contract
against the live working tree's uncommitted diff and the resolved, anchor-applied data.
Unit under review: the nine undressed frontier regions, two field-edge POIs each plus
`rim_poi_lore` bindings — dirty in `src/data/frontierRegions/{west,north,east,south}.js`
and `src/data/flavor/100-rim-poi-lore.js`. Plan: `design/program/attention/s-14-remainder-plan.md`.

## Gates run (this sitting, live tree)

- `node --test test/m2b-frontier-west.test.mjs test/m2b-frontier-north.test.mjs
  test/m2b-frontier-south.test.mjs test/m2b-frontier-east.test.mjs
  test/pulse-volume-fill.test.mjs test/depth-program-flavor-loader.test.mjs`
  → **40/40 pass, 0 fail** — including PULSE-07 "every authored rim POI id has a lore
  entry with ≥3 lines" (all 18 new POIs bind) and the m2b card↔anchor join gates
  (every new card row's anchor resolves a finite `pos`).
- `node scripts/check-sector-geography.mjs` → **511 ok, 0 fail** (25 sectors).

## Corpus laws (independently re-derived against resolved SECTORS)

- **Additive-only** — `git diff --numstat`: 104/68/102/34/182 insertions, **0 deletions**
  on west/north/east/south/lore. Every hunk is a `// ATTENTION S-14`-marked tail append
  inside an existing `pois`, `anchors.pois`, or `entries` array; context rows
  (`poi_nyx_runner_memorial`, `poi_kepler_stash`, `poi_orcus_plinth`, the `lp_03` lore
  entry, etc.) untouched. No foreign hunk swept.
- **Finite positions inside region bounds** — verified on the loaded `SECTORS` graph
  (anchor merge applied), not on source text: all 18 `pos` are finite and inside
  `worldRadius` (4700–5500; max |pos| ≈ 1100). Every anchor comment's claimed field
  center/radius matches its `anchors.fields` row exactly (f_nyx_1 420,-780 r440;
  f_kepler_1 680,-420 r420; f_orcus_3 1160,-860 r420; f_rhea_1 480,-320 r440;
  f_phoebe_2 -880,-240 r520; f_nereid_1 420,-640 r440; f_proteus_1 680,-420 r460;
  f_triton_3 -980,-380 r420; f_sedna_2 -150,-1150 r450; etc.). POIs sit ~82–91 WU off
  their named field centers, inside the cluster radius — the identical convention the
  landed first batch used (`poi_hyperion_stake_line` ~85 off f_hyperion_1).
- **Mark-blocked, zero bounty-pool delta** — replicated `markPoiEligible`
  (`src/data/bountyMarks.js:136–143`) over all 18 resolved POIs: every one returns
  `false` via `poi.discoveryPlate`; the two derelict-typed entries
  (`poi_orcus_shepherd_tag`, `poi_triton_abandoned_survey`) are plate-blocked the same
  way. Types used — `beacon` ×16, `derelict` ×2 — are both in `POI_TYPES` vocab.
  All 18 plates carry non-empty `title` + `body`.
- **IDs unique across the corpus** — each of the 18 ids exists in exactly its own
  region file (one card row + one anchor row, the required join) and the lore pack;
  zero collisions anywhere else in `src/`. Pack-wide: 91 entries / 273 line ids,
  **zero duplicate entry ids, zero duplicate line ids**.
- **Lore binds to real POIs in the correct region register** — every entry's
  `location.sectorId` equals the sector that actually resolves its `location.poiId`
  (verified on resolved SECTORS, not by string search): kepler_scar×2, nyx_march×2,
  orcus_shadow×2, rhea_cinder×2, phoebe_echo×2, nereid_shoal×2, proteus_well×2,
  triton_wake×2, sedna_dark×2. Each entry has exactly 3 lines; `displayName` matches
  the POI card `name` for all 18. Field-type prose is true to the authored seam type
  (verified programmatically: e.g. `poi_phoebe_struck_face` "singing seam" on
  `ast_crystalline` f_phoebe_3; `poi_phoebe_listener_post` "gas field's edge" on
  `ast_gas_cloud` f_phoebe_2; `poi_proteus_bearer_post` "crystalline seam" on
  `ast_crystalline` f_proteus_2 — all 18 match).
- **GLB references resolve** — all 7 used props (`place_tally_post`,
  `place_asteroid_graffiti`, `place_worklight_tower`, `place_claim_mark`,
  `place_ash_pin`, `place_nav_buoy`, `place_cold_locker`) exist as rows in
  `assets/ships/parts/parts_manifest.json`, resolve through
  `assets/ships/release/release_manifest.json`, have release GLBs on disk under
  `assets/ships/release/parts/places/`, and are mapped in `src/render/partsLibrary.js`
  (places list lines 365–386). No release-manifest pin churn required — all predate
  this unit.

## Plan-vs-diff check

All 18 rows match the plan table exactly — id, type, `landmarkGlb`, `visualRadius`,
position, and named field: vr values vr9/vr16/vr12/vr5/vr6/vr16/vr9/vr16/vr16/vr10/
vr9/vr5/vr16/vr11/vr10/vr6/vr9/vr16 as tabulated; positions byte-identical to the
plan's stated coordinates. Numbering comments (6/14–14/14) continue the landed
batch's 14-region order; the first five regions' rows (1/14–5/14) are untouched.

## Foreign noise observed, not rejectable

Heavily dirty tree throughout (~150 modified files, many untracked artifacts from
other lanes — encounters rewrites, ORRERY layouts, ui/style churn, debug scratch
files). The five reviewed files are cleanly separable by pathspec; nothing in them
belongs to another lane. `src/data/flavor/index.generated.js` is not stale — the
index derives `FLAVOR_TEXT_ENTRIES` from the live modules, so no regeneration was
owed (the freshness gate inside `depth-program-flavor-loader.test.mjs` passed).

## Verdict

**APPROVED FOR LANDING — round 2 of 3.**

The diff is additive-only, plate-complete, mark-pool neutral, id-unique, bound to
real geography, and asset-true. No defects found; nothing required fixing. Third and
final clean review still required before the unit lands.
