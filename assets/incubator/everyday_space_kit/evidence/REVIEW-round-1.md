# Pixel review — round 1 (2026-08-08)

Reviewer: build lane (multimodal read of every hero render, the six family sheets and
six composition boards from the round-1 build). Method: the lane-furniture rule —
LOOK AT THE PIXELS; the build numbers (tris, envelopes, part counts) flagged none of
the findings below. The dispositions below are the build lane's historical record,
not independent acceptance. The controlling independent preservation review at the
end of this file found semantic/no-RNG repeatability but disproved byte-deterministic
rebuilds and found one claimed round-2 repair still open.

## Systemic defect classes (each hit multiple assets)

| # | Class | Assets hit | Disposition |
|---|---|---|---|
| S1 | **Floating floods** — work lights authored at standoff positions with no bracket read as detached cubes | crusher, ore_sorter, conveyor, construction_frame, parts_rack, drill_platform | `flood()` grew a `mount` bracket parameter; every offender now mounts to structure or became an attached light bar/strip |
| S2 | **Identity marks on +Y** — plates, placards, lamps authored on the face the review camera (and the +X-working-face convention) never sees | pod plate, hazmat placard, ore box plate+rim, sorter grade lamps, slurry level lamp, conveyor motor, gantry plate, habitat windows | all moved to -Y/+X; habitat window row was THE occupancy signal and was fully invisible |
| S3 | **Floating fittings** — strobes/hoods/plates hovering off structure | rack bay strobe+plate, scaffold lamps/basket/jaws, clamp hood, cage hood, hull_rack hood, pirate hood, shuttle plate, passenger plate, comms rim strobes | anchored to rails/posts/apex caps; comms rim points recomputed on the tilted dish; passenger plate became a hanging sign |
| S4 | **Un-anchored cargo/structure** — load paths that stop mid-air | rack top pod above the frame (legs ended at 4.0), hull_rack sections with no bed rails, illicit berths authored FLAT at one z, improvised-dock arm rooted in air, cold-drill bit stowed over the ring hole | legs extended + crown rails; bed rails added; berths rebuilt as upright cradle hoops / V-posts; welded arm mount; bit clamped ON the ring deck |
| S5 | **Invisible trade light** — the amber/hot/arc identity killed by geometry or strength | radiator cores fully enclosed by their frames (0.10 core inside 0.22 frame, SAME center), drill with no visible amber, customs aperture buried inside the wider head | cores made proud of the frame; lit amber collar above the drill bit; aperture moved proud of the head face; `esk_radiator_hot` 1.5 → 2.2 |

## Notable single-asset findings

- **crusher_module**: four rotated plates crossed into an X-mess and the "rim" was a
  SOLID slab capping the funnel, hiding the feed → rebuilt as one 4-vert pyramid
  shell + scorched throat + 4-strip rim frame.
- **transfer_arm**: grapple fingers splayed OUTWARD (sign error) — a dangling stool;
  boom visually detached from the post; teal post read as a glass water column →
  fingers curl inward, post cap + counterweight tie added, post is alloy.
- **parts_rack**: plate rotation math laid the stock nearly flat, sliding out of the
  frame → plates stand near-vertical leaning against the spine.
- **inspection_platform**: cradle jaws too far apart and too shallow — two tilted
  walls → plinth-mounted V-cradle at ±2.4, tilt 0.4.
- **transponder_gate**: pass/hold lenses faced -X, invisible to the review camera and
  contradicting the kit's +X working-face contract → approach face flipped to +X.
- **scrap_cage**: junk poked through the bars; a mesh diagonal escaped the cage end;
  the gate was a floating bent goalpost → junk pulled inside, mesh clamped, gate
  rebuilt as a hinged rectangle at yaw 0.9.
- **utility_module**: monochrome beige (all near-identical pale roles) — the muddy
  read the art direction forbids → amber insulated pipe run, teal service band,
  service-blue hatch, darker fins.
- **shuttle_dock**: closed cradle hoops read as an empty cube picture frame; the
  glazed walkway hung 1.7 m off the deck → open-top saddles, walkway moved onto
  the deck. Its paired green/red approach lane was the round's best light read.
- **illicit_transfer_frame**: weakest asset of round 1 — both berths were flat
  wireframe outlines on the ground → vertical teal cradle hoops (berth A) vs ochre
  V-posts (berth B), preserving the mismatched-gauge story.
- **ore_bulk_container**: load read as one smooth centered egg → two spread lump
  clusters that fill the box.
- **Boards**: staged light beams (weld arcs, cut beam, scan beam) vanished at
  board camera radii → staged radii 2.5x; comp cameras widened (comp1 cut off its
  conveyor/containers).

## Accepted-as-is (recorded, not fixed)

- **Emissive wash**: strobes and lens whites wash toward white under the review
  rig's d²-scaled key light (nav reds read pink, authority blue reads ice). The
  trade-color separation survives at the distance bands, and in-game lighting is
  far darker than this rig; per the npc-pack lesson raising strength past ~3 would
  white them out for real. Left as a promotion-time texture/bloom question.
- **Rust renders salmon** under the warm key — consistent across the family, still
  clearly "not fleet paint"; acceptable at the flat-material stage.
- **Part counts** on truss-heavy assets are one-object-per-truss by design (joined
  meshes), so LOD1 swaps are straightforward.

## Round-1 passes (no geometry change needed)

extraction_mast, worklight_tower (same standard), interdiction_buoy, solar_array
(spine tips trimmed only), observation_blister (equator glow band added for the
opaque-dome occupancy read), freight_platform (gauge note only), power_skid,
welding_drone (arm posture leveled), customs_pylon silhouette, transponder_gate
structure, habitat_pod_derelict damage story, family-sheet labelling.

---

# Independent preservation review (2026-08-08, controlling)

Reviewer scope: all 46 source GLBs; every original-resolution hero and distance
render; all six 1920×1400 family sheets; all six 1920×1200 composition boards;
builder, report, catalog, composition manifest, provenance, sockets, collision,
materials, and runtime/release reachability. This review decides only whether the
unwired pack is worth preserving as a donor. It is not a runtime or visual gate.

## Bound identity and disposition

| Item | Frozen value |
|---|---|
| reviewed parent | `8809e13b76296258a0130c8a3408a309485923df` |
| builder SHA-256 | `116a1f23e75d1edf8f883ddb2af8dcb54694c3da2a7e3c0ad8aff2771553180b` |
| build-report SHA-256 | `395b79d3ac047ff479a9b0b17f907e66d42f8255163dc1b75143fe5293032c9f` |
| compositions SHA-256 | `29c39a1fa10dfcf3737a9d04fa98ac4d7206028f83bb0568fa3afc5bb598c8bb` |
| 46-GLB tree | 4,474,412 bytes; sorted `path + bytes + sha256` digest `871009f53b42693241f3a680675f1552491db280992a1494162893ddb8c1cb3a` |
| reviewed PNG tree | 198 files / 222,463,035 bytes; sorted `path + bytes + sha256` digest `73eb82d027159e12ca329dca45c1b764c6e64b77b354e59030b8dbc84c17d99d` |

**Verdict: KEEP all 46 as source-only `design_candidate` donors; REVISE before
promotion.** No asset, family, board, or receipt is accepted for release or runtime
use. Nothing closes G0-G7, headed Browser/Electron review, performance,
accessibility, or route acceptance.

## Technical result

Verified: 46/46 report hashes and byte counts; 58,452 triangles; 909 mesh parts;
57/57 sockets; valid GLB 2.0 structure/accessors/indices/transforms; 46/46
single-box collision proxies containing their source geometry; 32 declared
`esk_*` material roles; exact catalog reconstruction; exact six-scene composition
manifest; 198/198 PNG CRC/dimension checks; no RNG/wall-time/UUID geometry input;
zero exact ID/hash collisions elsewhere under `assets`; and zero runtime,
selector, release-manifest, parts-library, bundle, or package reachability.

Promotion blockers:

1. **Byte reproducibility failed.** Two isolated Blender 5.1.2 no-render builds
   reproduced a canonical semantic signature for 46/46 assets, but 29/46 fresh
   GLBs and the report differed bytewise because triangle/accessor serialization
   order changed. The geometry is no-RNG/semantically repeatable; the bytes are
   not deterministic.
2. **The evidence set is not one atomic exact-source epoch.** The builder writes
   report/catalog before optional sheets/compositions, does not clean or validate
   a closed output set, renders mutable/rebuilt scenes rather than re-importing
   the finalized GLBs, and stores no image hashes in `compositions.json`. The
   canonical set is 196 PNGs; `comms_array@95u.png` and `@145u.png` are retained
   supplemental alternatives beside the report-authoritative 30/60/110 views.
   All 198 PNGs also carry ambient render-time metadata.
3. **Bounds are conservative rather than promotion-ready.** Nine assets have
   >0.5% bound inflation. Worst is `crusher_module`: reported/collision size
   11.954×10.889×9.250 m versus exported-vertex size 10.010×7.150×9.250 m
   (+19.4% X, +52.3% Y), creating substantial phantom-collision space.
4. **The crusher repair is not closed.** `hopper_shell` and `hopper_throat` remain
   default capped cones (12 triangles each, cap triangles at both axial ends).
   The visible grey top closes the supposed feed opening, contradicting the
   historical open-shell/throat disposition above.
5. **Surfacing/LOD remain candidate debt.** All 331 exported material records are
   double-sided; the 909 primitives use flat role colors and zero textures; no
   authored LOD hierarchy exists. These are useful authoring donors, not a
   whole-asset material or performance pass.

## Original-resolution visual result

The round-2 attachment changes are often visible: cargo racks have clearer load
paths, repair/salvage fittings sit on structure, transfer-arm fingers curl inward,
the drill collar and radiator cores expose trade light, civic windows face the
review camera, and law approach signals face the authored working side. That makes
the pack worth preserving.

They are not all closed. In addition to the capped crusher, `comms_array` still
shows a red beacon conspicuously suspended above the tilted dish;
`habitat_pod_derelict` has a detached-looking solar panel and cardboard-like hatch
damage; `inspection_platform` still reads as two oversized tilted slabs; the cold
drill's claimed clamp is unreadable; both repair scaffolds retain detached-looking
jaws; and the breached pod, smooth-loaf ore, tanker coupling, ore sorter,
construction frame, welding drone, salvage clamp, hull rack, illicit transfer
frame, patched power skid, passenger platform, and several small signal/mast forms
lose their stated function without labels or composition context.

It remains a blockout library. Dominant forms are mostly cubes, cylinders, thin
trusses, and untextured plates; material response is flat and repeated; bevel and
wear hierarchy is sparse; light colors wash toward white; and small work cues
collapse at the far bands. The family sheets are not reliable acceptance evidence:
several subjects/labels are cropped at frame edges and oversized diagonal labels
overlap the assets. Exact failures include clipped `traffic_signal` and
`interdiction_buoy` labelling on the law sheet, a severely cropped shuttle-dock
row on civic, and a cut-off hull rack plus overlapping illicit-frame/pirate labels
on salvage. Cargo cuts off the left-side rack/pod group and both the abandoned-rack
and breached-pod labels; mining cuts the drill at right and crusher at bottom while
the radiator label escapes left; service cuts the bent scaffold at bottom and lets
the gantry label overlap its subject. The composition boards communicate useful yard grammar, but
their sparse staging, uniform lighting, rebuilt-scene source, and missing runtime
context make them concept/reference boards only.

### Asset-by-asset preservation matrix

All 46 rows are preserved for source history and possible re-authoring. The
stronger forms are donor-only KEEP; the following 19 are **REVISE-first** and
should not seed promotion until their named form failure is repaired:
`cargo_pod_standard_breached`, `ore_bulk_container`, `tanker_coupling`,
`drill_platform_cold`, `crusher_module`, `ore_sorter`, `repair_scaffold`,
`repair_scaffold_bent`, `construction_frame`, `welding_drone`, `customs_pylon`,
`inspection_platform`, `habitat_pod_derelict`, `comms_array`,
`passenger_platform`, `salvage_clamp`, `hull_rack`, `illicit_transfer_frame`, and
`power_skid_patched`. Every other asset is still **REVISE before runtime
promotion** because the pack-wide material, assembly, LOD, collision, and evidence
defects remain. “Readable” describes the preserved authoring idea, not acceptance.

| Family | Assets reviewed at hero + all three authored bands | Independent read |
|---|---|---|
| cargo | `cargo_pod_standard`, `cargo_pod_hazmat`, `cargo_pod_standard_breached`, `ore_bulk_container`, `container_rack`, `container_rack_abandoned`, `transfer_arm`, `tanker_coupling`, `freight_platform` | Standard/hazmat pods, both racks, transfer arm, and freight platform are useful donor ideas. The breach is appliqué geometry, ore reads as smooth loaves, and the tanker's detached slab/load path remains. Flat boxes and disappearing fittings weaken every far-band read. |
| mining | `drill_platform`, `drill_platform_cold`, `crusher_module`, `ore_sorter`, `slurry_tank`, `radiator_bank`, `conveyor_truss`, `extraction_mast` | Active drill, slurry tank, radiator, conveyor, and mast have useful grammar. The cold bit clamp is unreadable, crusher is visibly capped, and sorter screen/ore/grade lamps remain slab–puck–white-cube shorthand. |
| service | `maintenance_gantry`, `repair_scaffold`, `repair_scaffold_bent`, `construction_frame`, `welding_drone`, `parts_rack`, `power_skid`, `worklight_tower` | Gantry, rack, skid, and worklight are useful donors. Scaffold jaws remain detached-looking, construction reads as box-plus-hoops, and the welding drone is a cube with prongs beyond close range. No authored LOD supports the large structures. |
| law | `customs_pylon`, `inspection_platform`, `interdiction_buoy`, `transponder_gate`, `sensor_mast`, `traffic_signal` | Gate/checkpoint hierarchy and approach-light intent survive; gate, buoy, mast, and signal are the strongest donors. Customs pylon becomes a generic post, the inspection cradle remains ambiguous slabs, and the small devices depend on washed luminous rectangles. |
| civic | `habitat_pod`, `habitat_pod_derelict`, `shuttle_dock`, `observation_blister`, `comms_array`, `solar_array`, `utility_module`, `passenger_platform` | Habitat/dock/utility silhouettes are useful; shuttle approach lights and occupancy rows survive. Derelict damage floats, the comms beacon repair is still open, and the passenger platform reads as a terrestrial bus shelter; array/platform details thin out sharply. |
| salvage | `salvage_clamp`, `scrap_cage`, `hull_rack`, `illicit_transfer_frame`, `improvised_dock`, `pirate_sensor_mast`, `power_skid_patched` | Cage, improvised dock, and pirate mast provide useful donor grammar. Clamp function is unclear; hull sections read as repeated hoops; two-gauge berths collapse to a box-with-tail; the patched skid's fin reads as a sail/sign. |

### Composition-board disposition

- `comp1_mining_worksite`: useful site grammar, but broad spacing and thin trade
  cues keep it a staging reference rather than a density/readability proof.
- `comp2_refinery_loading`: cargo/truss density communicates work; the law traffic
  signal is nearly lost and oblique. Donor-only KEEP.
- `comp3_customs_checkpoint`: strongest board; paired pylons, frontal gate,
  inspection platform, mast, buoy perimeter, and scan beam form credible grammar.
  Primitive/material defects remain. Donor-only KEEP.
- `comp4_repair_yard`: readable repair grouping, but staged client/weld beams and
  even lighting do not prove live interaction or asset-level material quality.
- `comp5_shipbreaking_yard`: central hull-rack wire noise dominates, clamp action
  is unclear, and staged slabs confuse the cage read. REVISE as a composition
  target; preserve only as a donor sketch.
- `comp6_station_construction`: useful civic punctuation, but service/construction
  geometry dominates and the foreground comms dish unbalances the scene.

## Promotion handoff

Select one exact asset or repeated family, re-author it under the current whole-
asset fiction/material workflow, compute tight exported-geometry bounds, author
real LODs, and render an imported finalized GLB into a clean hash-manifested
evidence root. Review matched original-resolution views and runtime context before
adding any manifest/selector/release mapping. Do not wholesale-promote this pack or
replace an accepted runtime asset merely because a donor exists here.
