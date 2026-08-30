# Works Massline Core — reference brief (Cycle 06 form/readability revision)

**Asset:** `massline_core` (PQ-131.02). **Class:** place/prop, works camera only. **Tier:** B
(signature installed machine). **State:** `design_candidate`. Cycle 6. This page is the
contract for later cycles. G1/G2/G4 whole-asset remain open. Independent review is
`review_pending` / `revise`; this cycle does not launch reviewers.

Cycle 03 clay still collapsed to a nut/icon: eight equal pie wedges, four L-arrow shoes
with diagonal occupancy gussets, a yellow lamp tab, a chrome-coin inner race, and a
plus-dot site marker. Cycle 04 keeps identity, hooks, envelope, cameras, the open well
and the inner race, and rebuilds the load-bearing form as a square wellhead flange with
a round bore and a U-channel that opens upward. Cycle 05 corrected portable material
wiring and added exact LOD2 evidence. Cycle 06 responds to the exact-hash visual review
by deepening/widening the U-channel and skirt, retaining a modeled far-LOD race shoulder
and +X hatch, and enlarging the hooded lamp fixture. No identity, hook, camera, or envelope
contract changes.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same camera, object offset to the
frame edge so side walls read), `works_site` (19 px/cell). All 1920×1080, 31° perspective, +Z up,
origin at cell centre, underside at z = 0. Never orthographic. No fog. No studio three-quarter.

Identity / export:

- Blender root / contract: `SF_WORKS_MASSLINE_CORE_V1`
- LOD roots: `LOD0_massline_core`, `LOD1_massline_core`, `LOD2_massline_core`
- Hooks (empties, exact names): `ring_spin`, `lamp`
- Candidate part: `assets/ships/parts/works/place_works_massline_core.glb`
- Envelope: **one 2.2 × 2.2 WU cell**, height **≈ 1.1 WU** (0.5 cell)

The Rover is the **only** safety-yellow object in the mine. This asset never wears that livery.

---

## Cited local references (geometry/textures are NOT imported)

These three (plus one interface close-up) are the only image authorities for Cycle 01. They
are cited, not sampled. No pixel, mesh, or map from them is copied onto the candidate.

| # | Exact local path | What is selected | What is rejected |
|---|---|---|---|
| 1 | `assets/concept/archetypes/concept_station_mining.jpg` | Heavy bolted industrial: furnace mouth as a **dark well** with a thick refractory lip, overlapping plate courses, hex fasteners at real joints, warm work-light, dark painted steel. | Yellow hazard livery as a body colour; glowing slag as a material; whole-station identity. |
| 2 | `assets/concept/landmarks/concept_landmark_driller.jpg` | A machine that **claims the rock**: load path from a squat body down into stone, dark oxidised metal, corner mass, no halo. | The giant auger; the wrecked-ship silhouette; gold ore sparkle as paint. |
| 3 | `assets/works/rover/reference/ref_01_overhead_crawler.png` | Works-camera grammar: a **hole is a hole** (hopper well), fasteners at interfaces, tracks/body as separate masses, dusk raking key. Scale: at 120 px/cell a 1-cell object occupies ~264 px across. | Safety-yellow alkyd. Tracked-crawler planform. Any rover part. |
| 4 | `assets/works/rover/reference/ref_03_boom_bit.png` | Interface language: flange, bolt circle, hydraulic fittings, heat-tinted tool steel, hoses that terminate. | Bit identity; yellow; using the photo as a normal/AO bake. |

Contact sheet (composed at build time from the four cited files, labelled, never projected):
`assets/works/massline_core/reference/CONTACT_SHEET.png`.

Procedural stand-in this replaces (do not copy): `src/render/asteroidInteriorPreview.js`
`buildMachines` Massline Core — hex column + **emissive torus** + cone cap. That is a halo on a
primitive. Cycle 01 is the opposite of that picture.

`componentReferenceDecision`: `not_needed` for a whole-asset regen. Native cited stills above
are enough to name manufacture. Frozen identity is the envelope and hooks in this brief, not
the cited pixels.

---

## Fiction (ART EXTRAPOLATION unless noted)

A **Helix/MTS claim-anchor wellhead** driven into a bored cell and pretensioned into the rock.
Canon: Helix Directorate + MTS ore trade; this specific pattern is extrapolated. It is the
thing that **claims the rock** — a squat machined collar around a dark central well, not a
beacon, not a coin, not a spinning halo.

The massline field is generated in the open throat. A slow azimuth ring rides a bearing race
on the collar so later surface gear can clock against the claim. A single hooded status lamp
tells the gallery the well is live. Four corner root plates carry pretension into the cell.

| Assembly | Manufacture |
|---|---|
| Well liner | Dry refractory / sintered mineral, thick wall, open through. Dark, dusty, not metal. |
| Collar | Continuous formed U-channel, cavity opening +Z so the trench reads from above (inner flange / dark floor / outer flange). Four cardinal lap straps. Dark alkyd over zinc primer. |
| Square flange / deck | Square outer, circular inner. Corner fill is the manufactured square-minus-bore plate. Not a featureless slab; the U-trench and skirt break it. |
| Spin ring | Machined bearing race nested in a rebate. Restrained dark bare steel. Separable. Parent: `ring_spin`. |
| Skirt / shoes | Folded-down square angle iron sitting on the rock, plus thickened corner pads of the frame. No diagonal occupancy gussets. Underside at z = 0. |
| Service hatch | One rectangular access cover on the +X deck, proud, with a strap and two bolts. Breaks the spin symmetry. |
| Lamp | Arm + socket + hood with a visible cavity + small lens, rooted on the +Y frame. Only the lens is emissive. Parent: `lamp`. |
| Fasteners | Modelled hex heads at real joints (0.03–0.04 wu). Not texture studs. |

---

## Silhouette from directly above (the only view that matters)

At `works_top` the cell is ~264 × 264 px. Five shapes a person resolves. If the outline is a
torus, coin, tire, halo, compass-rose, plus-dot, or flat icon, the asset has failed.

1. **Dark circular well** — a real open hole, thick liner lip, you can see down it.
2. **Square wellhead flange** — square outer, round bore, corner mass as part of the plate.
3. **U-channel trench** — inner flange / dark floor / outer flange, visible from above.
4. **Spin ring** — a distinct inner race in a rebate, separable from the flange/liner/lamp.
5. **One rooted hooded lamp** — arm, socket, hood with a cavity; never a glowing ring or painted tab.

Asymmetry: service hatch on the +X deck; lamp on the +Y frame. Clay must read the hole,
the square skirt, and the U-trench without textures.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **2.20 × 2.20 × 1.10 wu**. Origin at cell centre. +Z up. Underside
on the cut face (z = 0). Footprint stays inside ±1.10.

| Part | wu (Cycle 06) |
|---|---|
| Envelope X × Y × Z | 2.20 × 2.20 × 1.10 |
| Well inner radius (open hole) | 0.30 bottom / 0.42 mouth |
| Liner outer radius / height | 0.52 / 0.012–0.62 |
| Mouth lip | r 0.41–0.55, z 0.56–0.74 |
| Inner race (ring_spin) | 0.500–0.555 / z 0.470–0.535 (nested rebate, not a proud cap) |
| U-channel collar | r 0.55–0.91, z 0.095–0.475, cavity +Z, continuous |
| Square flange / skirt | outer ±1.04, deck z 0.125–0.235, skirt height 0.220, wall 0.085 |
| Corner pads | 0.30 square, height 0.145, on the rock |
| Lamp | +Y frame (0.18, 0.90), arm + socket + hood cavity + recessed lens |
| Service hatch | +X deck (0.90, −0.22), ~0.31 × 0.17, proud |

Hooks:

- `ring_spin` at the spin-ring origin `(0, 0, 0.502)`. Children rotate. Skirt, liner, hatch, lamp
  do **not** parent here.
- `lamp` at the hood/lens socket. Children: arm, hood, socket, lens. Only the lens emits.

Budget: LOD0 ≤ 8,000 tris, LOD1 ≤ 2,000, LOD2 ≤ 600. Maps: authored 1024² basecolor / normal /
ORM on LOD0. LOD1/LOD2 keep the hole, the four-shoe square silhouette, both hooks, the
modeled ring shoulder, and the +X asymmetry hatch.

---

## Material bill (preflight)

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
Working scene: `tools/blender/build_works_massline_core.py`.

| Zone | Disp. | Substrate / process | Finish | Optical | Forbidden |
|---|---|---|---|---|---|
| Collar / shoes / hood / arm paint | billed | Formed steel plate, welded hat courses | Dark alkyd `#191714`–`#2a2622`, dielectric, edge wear | Rough 0.52–0.68, metal 0.06–0.12 | Safety yellow; shiny plastic; uniform AO dirt |
| Wear metal (race, bolts, hatch lip) | billed | Machined steel, grease, abrasion | Restrained bare `#303338`–`#3a3e44` | Rough 0.38–0.50, metal 0.70–0.80 | Chrome; coin highlight |
| Well liner | billed | Dry refractory / sintered mineral | Dark dusty `#0c0a09`–`#1a1614` | Rough 0.84–0.94, metal 0.01–0.04 | Brown disk/plug; metal paint; glowing well |
| Service accent | billed | Primed hatch strap / ID plate | Restrained warm oxide `#6a4a32` | Rough 0.50–0.62, metal 0.18–0.28 | Yellow; large orange brick |
| Lamp lens | billed | Recessed dielectric | Warm `#dcc28a`, **emissive only here** | Rough 0.22–0.30, metal 0.02 | Beacon; painted tab; emissive ring |
| Pad underside / rock interface | billed | Scaled mill scale, fines | Darker than shoe top | High rough, low metal | Floating; no contact |

World: dark. Key `0xffdcbc` raking, real shadows, cool rim, weak fill, ≈5:1 key:fill on the
pad. Bevels must exist. The well must be a hole the key cannot fill.

Shape-grammar failure of Cycle 03: **nut / compass-rose icon** (pie-wedge collar + L-arrow
shoes + diagonal occupancy gussets + yellow tab lamp). Replacement sequence: open tapered
liner → continuous U-channel (cavity +Z) → square deck with round bore → folded angle skirt
and corner pads on the rock → nested dark race → one hooded lamp on the +Y frame → one
repair hatch. Clay must read that without textures.

---

## Quality axes (grade these, not taste)

1. **Planform at 120 px/cell** — hole + square flange + U-trench, not a coin/halo/compass.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Well is a hole** — open through, thick liner, dark inner wall, no brown plug.
4. **`works_edge` shows side depth** — skirt, channel web, raised lip, not a decal.
5. **Yellow discipline** — zero safety-yellow pixels.
6. **Lamp is a lamp** — hood cavity / socket / arm; emissive off still reads as a fixture.
7. **`ring_spin` is separable** — rotating the hook does not move skirt, liner, or lamp.
8. **Manufacture** — U-section, fasteners at interfaces, one asymmetric hatch; no occupancy fins.
9. **LOD** — LOD1/LOD2 keep hole, square outer, U-trench, lamp, ring hook at 19 px/cell.

Cycle 06 remaining review risk: the revised U-trench/skirt and far-LOD features must still
receive a fresh original-resolution exact-hash whole-asset review, including the player
route. The candidate remains `review_pending` / `revise`; do not treat this cycle as KEEP.
