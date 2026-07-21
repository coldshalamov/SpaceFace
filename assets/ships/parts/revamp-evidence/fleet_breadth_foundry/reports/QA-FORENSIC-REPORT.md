# QA-FORENSIC-REPORT — Fleet Breadth Foundry (adversarial re-verification)

**Reviewer lane:** FORENSIC QA (adversarial). **Worktree:** `C:\Users\93rob\sf-fleet-breadth`
**Date:** 2026-07-20. **Mandate:** try to break the acceptance of three lanes; assume defects
until disproven; report real findings, invent none, soften none.

## Method (ground truth, not trust)

- **Mechanical re-measurement of ALL 67 GLBs** (not just the seeded samples) via one headless
  Blender 5.1 pass (`measure_glbs.py`): per-object world-transform decomposition, world bbox
  dims, triangle count (post-import), material name set, empties/cameras/lights, UV zero-area
  fraction (3D-nondegenerate faces with degenerate UV), edge-dihedral histogram on a
  merge-by-distance-welded copy (glTF splits verts at every seam, so welding is required before
  topology/loose-part analysis), and loose-part bbox extraction for fastener geometry.
- **Seeded samples reported as the brief asks:** kit 15-piece = `random.Random(7).sample(sorted(names),15)`;
  audit 10-cite = `random.Random(7).sample(citation_claims,10)`. Full-set numbers are the defect net.
- **Visual:** the render tool `render_contact_sheet.py` (neutral_close/wireframe/game_cam for kit;
  neutral_close/zoom_out for scenery), composited into labeled review montages; every image looked at.
- **Distance test:** 4 fine-detail kit pieces rendered at native 512, down-sampled to 96 and 48 px.
- **Audit:** citations re-derived against source at the cited lines; traffic + hostile tables
  re-derived independently; the 3-gap Wasp fallback traced through the actual code path.

---

## TARGET 1 — GLM microdetail kit (47 pieces)

### Findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| K1 | Dims, tri counts, material names all match `kit_manifest.json` **exactly** for all 47 pieces (0 discrepancies). Max tris 795 (<800 hard; 21 over the 400 *target*, which is permitted). | PASS | `measured.json`; `analyze.py` "kit pieces with defects: 0/47" |
| K2 | Materials are strictly a subset of the four `KitMat_*`; only `KitMat_Steel`+`KitMat_Paint` used. | PASS (disclosed) | Allowlist is not require-all; producer disclosed 2-of-4. Not a defect. |
| K3 | All object transforms identity; no cameras/lights/empties embedded. | PASS | `all_transforms_identity=true` for every kit GLB |
| K4 | UV present on every mesh; **zero-area-island fraction ≈0** (max 0.26% on heat_shield_v02, ≪5% gate). *Island **overlap** was not precisely measured* — my only instrument was a coarse 64² UV-centroid bin (max 18 centroids/cell on dense pieces), which cannot prove non-overlap and which I distrust; the clustering is consistent with dense bevel/rivet facets packed by Smart-UV, and practical impact is low for runtime-tinted flat `KitMat_*` pieces with no per-piece bake. Honest scope: zero-area clean, overlap unquantified. | PASS (zero-area); overlap not measured | `uv_zero_frac` / `uv_max_cell` cols in `analyze.py` |
| K5 | **Bevel on flat silhouette edges is real, not faked.** Pure box/plate/prism pieces show `sharp60_frac = 0.0` (plate_lip v01/v02, all 4 rail_split, bracket_gusset v02/v04, vent_grid_v02) — 90° corners split into <60° chamfer edges. Wireframe renders show the double-line chamfers. The producer's disclosed "no bevel on ≥8-poly curved parts" is accurate and within brief intent (silhouette edges beveled; curved facets read rounded). | PASS (verified producer's own defense) | `analyze3.py` bevel table; `_review_kit_wire.png` |
| K6 | **Fastener envelope holds — after resolving 4 raw out-of-range flags.** The naive per-loose-part extractor first reported `in-envelope=False` on 4 pieces; each is a measurement artifact, verified against `kitgen.py`: **(a)** fastener_recessed_v02 & rivet_strip_v02 — the 0.0167 m values are the *countersink bore / Allen socket* (inner cylinder = head_radius×0.35), a recess sub-feature, not the head; the actual head footprints are 0.0476/0.0496 m (in range). **(b)** fastener_recessed_v03 — the 0.4833 value is the full-length raised rail counted as a "rivet"; real heads 0.0515–0.0523 m; the polluted 0.0805 pitch is the same artifact. **(c)** rivet_strip_v03 — heads 0.0346 m fine, but median pitch 0.086 m < 0.10; this is the **two-row staggered interleave** nearest-neighbour, the structural column pitch is ≈0.172 m (in range). Net: head footprints 0.033–0.055 m (max 0.0546 < 0.06), structural pitches 0.147–0.263 m — all inside 0.02–0.06 / 0.10–0.30. | PASS (with 4 explained artifacts) | `analyze3.py` fastener table (shows the raw False rows); cross-checked vs `kitgen.py` builders lines 502–603, 771–834 |
| K7 | Visual: variants read as **different constructions**, not scale/copy (armor_spacer v01 cylindrical stubs / v02 honeycomb cells / v03 rail-mounted; weapon_collar v01 bolted flange vs v02 clamshell; bracket_gusset triangular vs L-strut). Nothing floats, intersects badly, or looks pasted-on. Wireframe topology healthy; no shading-critical ngon mess; cylinders/domes adequately segmented. | PASS | `_review_kit_neutral.png`, `_review_kit_wire.png`, `_review_kit_gamecam.png` |
| K8 | Distance test: graceful degradation, no aliasing/shimmer at 48 px. rail_split centre channel and vent_grid louvers (bold reads) survive to 48 px as banding; weld beads degrade to lumps; rivet micro-dots vanish by 96 px — expected for close-range dressing per the art-direction constitution. | PASS | `_review_distance_strip.png` |
| **K9** | **4 pieces protrude below the z=0 mount plane** (bbox_min_z: pipe_clamp_v01 −0.142 m, vent_grid_v01 −0.033 m, pipe_clamp_v03 −0.025 m, access_panel_v02 −0.023 m). The D-report claims "every piece's bbox touches z=0, +Z out"; the bbox *contains* z=0 (literal claim holds) but 4 pieces have geometry below it, mildly contradicting "+Z out of the surface". pipe_clamp_v01's −142 mm loop routes below the mount plane. | **MINOR** | `measured.json` bbox_min; repair owner: **kitgen (GLM)** — clamp base geometry could snap to z≥0, or document sub-plane conduit routing as intentional. Low impact (integrator sets final placement). |

### Verdict — TARGET 1: **UPHOLD ACCEPTANCE** (with one MINOR)
The mechanical contract is clean (0/47 on dims/tris/materials/transforms/UV), bevels on flat
silhouette edges are genuinely present, the fastener envelope holds under proper head/sub-feature
separation, and the pieces read as distinct constructions with graceful distance behaviour. The
only real finding (K9) is a cosmetic sub-plane protrusion on 4 pieces, chiefly pipe_clamp_v01.

---

## TARGET 2 — Gemini scenery pack (20 props)

### Findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| S1 | Dims, tri counts, material names match `scenery_manifest.json` **exactly** for all 20 (0 discrepancies). Tri budgets OK: gate_ring_v02 4192 (<4500 gate_ring exception), gate_ring_v03 2636, all others <3000. | PASS | `analyze2.py` |
| S2 | All transforms identity; materials strictly the four `KitMat_*` with meaningful zoning (Emissive on lamps, Rubber on seals). | PASS | `measured.json` |
| S3 | **Sockets correct and complete:** `SOCKET_Top` on both claim_battery_mast + all 3 lane_beacon tips; `SOCKET_Dock` on all 3 gate_ring; **no** stray empties/cameras/lights on any other prop. | PASS | `analyze2.py` socket inventory |
| S4 | Origins correct: mast/beacon bases and stack bottoms at z≈0; buoy/ring centers symmetric — **except** gate_ring_v03 (Y-center off 0.4 m on a 63 m ring = 0.6%). Explained by intentional scavenge-hoop irregularity (manifest dims 63.0×62.6 non-square). | COSMETIC | `analyze2.py`; repair owner: **scenerygen (Gemini)** — recenter or accept as design-intent |
| S5 | **gate_ring_v02 re-judge (twice-repaired):** geometry is a credible **open octagonal space-truss** (paired chord tubes, X-bracing, corner gusset nodes) that *matches* the brief's "truss gate = open lattice" intent. No interpenetration, no absurd proportions (1.3 m chords on 84 m ring = 1.5%, proportionate). Reads clearly as a gate ring, distinct from v01 (smooth) and v03 (broken). **Caveat:** the H-report's repair-pass-2 prose ("massive, solid engineered ring structure") overstates it — at true zoom_out (fill 0.10) it is a thin octagonal *outline* and the 4192-tri truss detail goes largely sub-pixel. Prose overstatement, not an asset defect. | PASS (prose overstated) | `.../scenery/scenery_gate_ring_v02/{neutral_close,zoom_out}.png` |
| S6 | **container_stack is the weakest-distinct family.** Pairwise rendered-silhouette IoU at 64 px: v01/v02 0.84, v01/v03 0.85, v02/v03 0.79, with projected-area diff ~1–2%. Passes the producer's *bbox-aspect-OR-footprint-area* proxy (v02 larger, v03 squarer), but the actual outlines are ~80–85% overlapping; the variants rely on close-range surface construction (stagger, cut-open, straps) more than silhouette. | **MINOR** | `distance_silhouette.py` IoU table; repair owner: **scenerygen (Gemini)** — give one variant a distinct outline break (leaning stack / toppled unit) if 64 px outline distinctness is required |
| S7 | claim_hopper v01 vs v02 (flagged as a candidate "secretly-same construction" pair — near-identical bbox 4.15 vs 4.16): **cleared.** They are different constructions — v01 square grate hopper on 4 heavy legs, v02 octagonal drum funnel — silhouette IoU 0.75, area diff 0.16. | PASS (suspicion cleared) | `_review_scn_neutral.png`; `distance_silhouette.py` |
| S8 | All other families silhouette-distinct at 64 px (IoU ≤ 0.66; lane_beacon/wreck/sensor_dish ≤ 0.44). No floating parts, interpenetrating shells, or physically-absurd cantilevers found across the 20. | PASS | `_review_scn_neutral.png`, `_review_scn_zoomout.png` |

### Verdict — TARGET 2: **UPHOLD ACCEPTANCE** (with one MINOR)
Mechanically clean (dims/tris/materials/transforms/sockets/origins all correct bar a 0.6% ring
asymmetry), gate_ring_v02 is now credible truss geometry (the "massive solid" self-claim is prose
overreach, not a defect), and 19/20 families are silhouette-distinct. container_stack (S6) is the
one MINOR: its three variants are the least tellable-apart by pure outline at 64 px.

---

## TARGET 3 — grok repetition-audit.json (34 donors)

### Findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| A1 | **10/10 seed-7 citation claims confirmed EXACTLY — zero line drift** (all landed on the cited line, far inside the ±15 tolerance). Verified: partsLibrary.js 77 (billboard/PLACE_FILES), 373-374 (hull_miner defIds), 416 (ashline_lode/bruiser_brawler), 429-433 (helios_cradle/miner role); traffic.js 65-66 + 274-280 + 407 (hauler→ship_mule→trafficRole stamp), 75-80 (smuggler/rescue→ship_drifter); world.js 1190-1210 (gate archetypeGlb default), 1300-1316 (lane_beacon core dressing); sectorAnchors.js 34/75/156 (landmarkGlb lane_beacon); visualOverrides.js 30-37 (requiresProductionWholeShip). | PASS | direct source reads |
| A2 | **Traffic table re-derived independently = audit exact.** `TRAFFIC_ROLES` (traffic.js:64-85) weights {hauler 30, courier 18, miner 16, patrol 14, escort 8, smuggler 6, pirate 5, rescue 3, express 3} == audit `trafficRoleWeightsBase` verbatim. | PASS | traffic.js:64-85 vs audit |
| A3 | **Hostile whole-ship map re-derived = audit exact.** `WHOLE_SHIP_FILE_BY_HOSTILE_ID` (partsLibrary.js:414-418): wasp_swarmer→ashline_dart, bruiser_brawler→ashline_lode, reaver_pirate & corsair_raider→ashline_rig (shared). Matches audit donors + the factionsSharingSilhouettes "ashline_rig for both" finding (cite 417-418). | PASS | partsLibrary.js:414-418 |
| A4 | **LOAD-BEARING claim (drives Phase-3) is TRUE:** lancer_sniper/choir_zealot/quiet_ghost fall back to production Wasp. Full trace: all three exist in enemies.js (36 / 251 / 273) with `shipId: 'ship_wasp'` → `makeEnemySpawnSpec` calls `makeShipEntitySpec('ship_wasp')` which stamps `data.defId='ship_wasp'` (ships.js:468) and `data.lootTableId = enemy id` (combat.js:159, NOT a key in the hostile map) → `requiresProductionWholeShip` true for defId ship_wasp (visualOverrides.js:36) → `wholeShipVisualForEntity` skips hostile+traffic branches and resolves the defId branch to `WHOLE_SHIP_FILE_BY_DEF_ID['ship_wasp']` = `wholeships/wasp_production_v1.glb` (partsLibrary.js:488). Not ashline, not modular. | PASS | enemies.js, combat.js:88-162, ships.js:468, visualOverrides.js:30-37, partsLibrary.js:464-495 |
| A5 | **No donor with runtimeSelection entries lacks a citation.** 33/34 donors have all entries cited; the sole rs=[] donor (hull_gunship) is correctly classified "unreferenced by HULL_FILE_BY_DEF_ID" — confirmed absent from the defId→hull map (369-383); it appears only in a preload/seed-pool URL list (partsLibrary.js:168), matching the method rule and the audit's own note. | PASS | audit donor scan; partsLibrary.js:168,369-383 |

### Verdict — TARGET 3: **UPHOLD ACCEPTANCE** (no defects found — strongest lane)
Every sampled citation is exact, both re-derived tables match, the Phase-3-driving Wasp-fallback
claim is verified true end-to-end through the real code path, and there are no uncited
runtimeSelection assertions. This audit is trustworthy as an integration input.

---

## Review-render index

| Image | Contents |
|---|---|
| `renders/qa/kit/<piece>/{neutral_close,wireframe,game_cam}.png` | 15 seed-7 kit pieces × 3 views + `_views.json` |
| `renders/qa/kit/<piece>_sheet.png` | per-piece composited contact sheets (15) |
| `renders/qa/_review_kit_neutral.png` | 15-piece neutral montage (construction distinctness) |
| `renders/qa/_review_kit_wire.png` | 15-piece wireframe montage (topology/bevel) |
| `renders/qa/_review_kit_gamecam.png` | 15-piece game-cam montage |
| `renders/qa/scenery/<prop>/{neutral_close,zoom_out}.png` | all 20 props × 2 views |
| `renders/qa/_review_scn_neutral.png` | 20-prop neutral montage |
| `renders/qa/_review_scn_zoomout.png` | 20-prop zoom_out montage (long-range read) |
| `renders/qa/_review_distance_strip.png` | 4 pieces at 512 / 96 / 48 px |

Seed-7 kit sample (sorted): access_panel_v03, armor_spacer_v01/02/03, bracket_gusset_v01/04,
fastener_recessed_v04, pipe_clamp_v01, plate_lip_v01/03, rivet_strip_v03/05, sensor_housing_v03,
weapon_collar_v01/02.

---

## Overall

| Lane | Verdict |
|---|---|
| TARGET 1 — GLM kit | **UPHOLD ACCEPTANCE** (1 MINOR: K9 sub-plane protrusion) |
| TARGET 2 — Gemini scenery | **UPHOLD ACCEPTANCE** (1 MINOR: S6 container_stack outline distinctness) |
| TARGET 3 — grok audit | **UPHOLD ACCEPTANCE** (no defects) |

**CRITICAL findings:** none.
**MAJOR findings:** none.
All three lanes survive adversarial re-verification. The two MINOR items (kit K9, scenery S6) are
polish, not acceptance blockers.
