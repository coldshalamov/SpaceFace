# S-14 remainder review — ROUND 3 of 3 (final, independent verification)

Reviewer: round-3 subagent. Did not trust rounds 1–2 or the authoring pass; re-derived every
contract from the live uncommitted diff and the source rows it references. Unit under review:
nine undressed frontier regions, two field-edge POIs each plus `rim_poi_lore` bindings — dirty
in `src/data/frontierRegions/{west,north,east,south}.js` and
`src/data/flavor/100-rim-poi-lore.js`. Plan: `design/program/attention/s-14-remainder-plan.md`.

## Gates run (this sitting, live tree)

- `node --test test/m2b-frontier-west.test.mjs test/m2b-frontier-north.test.mjs
  test/m2b-frontier-south.test.mjs test/m2b-frontier-east.test.mjs
  test/pulse-volume-fill.test.mjs test/depth-program-flavor-loader.test.mjs`
  → **40/40 pass, 0 fail**, including PULSE-07 "every authored rim POI id has a lore entry
  with ≥3 lines" and all four m2b card↔anchor join gates.
- `node scripts/check-sector-geography.mjs` → **511 ok, 0 fail** (25 sectors).
- `node scripts/check-flavor-corpus.mjs` → **OK: 10 packs, 2244 lines** — pack-wide id and
  line-id uniqueness enforced and green.

## Independent re-derivation (not trusting prior rounds)

- **Additive-only, no foreign work** — `git diff --numstat` on the five files: 104/68/102/34/182
  insertions, **0 deletions**. Every hunk is a `// ATTENTION S-14`-marked tail append inside an
  existing `pois`, `anchors.pois`, or `entries` array. `git diff --cached` on the same paths is
  empty — the working-tree diff is the whole unit; no staged hunks, no foreign edits swept in.
- **Positions finite and inside bounds** — all 18 `pos` are finite integers; max |coord| ≈ 1150
  vs `worldRadius` 4300–5500 on the nine sectors. Every anchor comment's claimed field
  center/radius was re-checked against the actual `anchors.fields` row, line by line — all 18
  match exactly (f_nyx_1 420,-780 r440; f_nyx_2 -640,320 r380; f_kepler_1 680,-420 r420;
  f_kepler_2 -980,280 r380; f_orcus_1 720,-280 r420; f_orcus_3 1160,-860 r420; f_rhea_1
  480,-320 r440; f_rhea_2 -920,-640 r380; f_phoebe_3 900,-820 r380; f_phoebe_2 -880,-240 r520;
  f_nereid_1 420,-640 r440; f_nereid_2 -920,380 r400; f_proteus_1 680,-420 r460; f_proteus_2
  -1080,-640 r380; f_triton_3 -980,-380 r420; f_triton_2 940,280 r400; f_sedna_2 -150,-1150
  r450; f_sedna_1 720,-280 r420). Distances recomputed: 16 POIs sit ~90.5 WU off center,
  `poi_proteus_strip_marks` ~82.1 — all inside cluster radius, same convention as the landed
  first batch.
- **Bounty-pool neutral** — `markPoiEligible` (`src/data/bountyMarks.js:141`) returns `false`
  on `poi.discoveryPlate`; all 18 carry plates with non-empty `title` + `body`, including the
  two `derelict` types. Types used — `beacon` ×16, `derelict` ×2 — are in the `POI_TYPES`
  vocab (`src/data/sectors.js:27`, `west.js:75`).
- **IDs unique corpus-wide** — each of the 18 POI ids appears exactly 2× in its own region file
  (one card row + one anchor row, verified per-file) and 1× in the lore pack as `poiId`;
  zero occurrences anywhere else in `src/`. The 18 lore entry ids each appear once in
  `src/data/flavor/`; `uniq -d` over all 364 line ids in the pack is empty.
- **Lore binds correctly** — every entry's `location.sectorId` names a sector id that exists in
  the region file owning its `poiId` (kepler_scar/nyx_march/orcus_shadow in west.js,
  rhea_cinder/phoebe_echo in north.js, nereid_shoal/proteus_well/triton_wake in east.js,
  sedna_dark in south.js — all verified). `displayName` equals the card `name` for all 18;
  each entry has exactly 3 lines.
- **GLB refs resolve** — all 7 used props (`place_tally_post`, `place_asteroid_graffiti`,
  `place_worklight_tower`, `place_claim_mark`, `place_ash_pin`, `place_nav_buoy`,
  `place_cold_locker`) exist in `assets/ships/parts/parts_manifest.json`, in
  `assets/ships/release/release_manifest.json`, and as GLBs on disk under
  `assets/ships/release/parts/places/`. No manifest churn owed.
- **Register truth** — field-type prose matches the authored field type for all 18, including
  the three non-obvious registers, confirmed against in-source comments: f_orcus_3
  (ast_metallic) is the commented "shadow debris" flock (west.js:668,720) → "shadow debris'
  lead rock" is correct; f_phoebe_3 (ast_crystalline) is the commented "singing crystals"/
  "Song Field" (north.js:412,678) → "singing seam" is correct; f_triton_3 (ast_metallic) is
  the commented "Wake debris" field (east.js:588) → "wake-debris seam" is correct. The rest
  map literally: icy→"ice field", metallic→"metallic seam", rare_exotic→"exotic seam",
  gas_cloud→"gas field's edge", crystalline→"crystalline seam", common_rock→"common seam",
  and f_sedna_2's commented "dead lane buoys" → "dead-buoy drift".

## Plan-vs-diff check

All 18 rows match the plan table exactly — id, type, `landmarkGlb`, `visualRadius`, position,
named field. Numbering comments run 6/14–14/14, continuing the landed batch's order; the first
five regions' rows are untouched.

## Foreign noise observed, not rejectable

Tree remains heavily dirty from other lanes (~300 modified/untracked paths — encounters
rewrites, ORRERY layouts, sibling `attention/` catalogs e-01…v-04). None of it touches the
five reviewed files; all are cleanly separable by pathspec.

## Verdict

**APPROVED FOR LANDING — round 3 of 3, third consecutive clean approval.**

Additive-only, plate-complete, mark-pool neutral, id-unique, bound to real geography,
asset-true, register-true. No defects found. The unit may land.
