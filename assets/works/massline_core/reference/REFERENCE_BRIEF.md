# Works Massline Core — reference brief (Cycle 02 form correction)

**Asset:** `massline_core` (PQ-131.02). **Class:** place/prop, works camera only. **Tier:** B
(signature installed machine). **State:** `design_candidate`. Cycle 2 of ≥5. This page is the
contract for later cycles. G1/G2/G4 whole-asset remain open. Independent review is
`review_pending` / `revise`; this cycle does not launch reviewers.

Cycle 01 read as a flat washer / manhole on a filled brown square, with toy radial tabs,
stud-like feet and no lamp. Cycle 02 keeps identity, hooks, envelope, cameras and the dark
open well, and rebuilds the manufactured form.

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
| Collar courses | Formed steel channel (bottom flange + inset web + top flange), eight segments with real gaps and overlap. Dark alkyd over zinc primer. |
| Spin ring | Machined bearing race + eight bolt-lug segments. Bare/worn metal at the race. Separable. Parent: `ring_spin`. |
| Radial ribs / bolt lugs | Plate ribs from liner to collar; four corner feet are the load path into the rock. |
| Root plates / feet | Four folded-plate pads at the cell corners, gusseted into the ribs, hex-bolted at every interface. Underside at z = 0. |
| Service hatch | One rectangular access cover on the +X sector, proud, with a strap and four bolts. Breaks the spin symmetry. |
| Lamp | Hood + socket + small lens. Only the lens is emissive. Parent: `lamp`. |
| Fasteners | Modelled hex heads at real joints (0.03–0.04 wu). Not texture studs. |

---

## Silhouette from directly above (the only view that matters)

At `works_top` the cell is ~264 × 264 px. Five shapes a person resolves. If the outline is a
torus, coin, tire, halo, or flat icon, the asset has failed.

1. **Dark circular well** — a real open hole, thick liner lip, you can see down it.
2. **Segmented collar** — not a round tube; channel section, eight courses, bolt circle.
3. **Four corner feet** — pads on the diagonals, breaking the circle into a claimed square.
4. **Spin ring** — a distinct inner race with lugs, separable from the feet/liner/lamp.
5. **One small hooded lamp** — offset, a point of light in a can, never a glowing ring.

Asymmetry: service hatch on the +X collar sector; lamp on the +Y-ish deck. Clay must read
the hole, the four feet, and the channel section without textures.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **2.20 × 2.20 × 1.10 wu**. Origin at cell centre. +Z up. Underside
on the cut face (z = 0). Footprint stays inside ±1.10.

| Part | wu (Cycle 02) |
|---|---|
| Envelope X × Y × Z | 2.20 × 2.20 × 1.10 |
| Well inner radius (open hole) | 0.36 |
| Liner outer radius / height | 0.50 / 0.012–0.56 |
| Mouth lip | r 0.34–0.53, z 0.50–0.64 |
| Inner race (ring_spin) | 0.545–0.655 / z 0.655–0.790 |
| Collar U-channel | r 0.72–0.94, z 0.145–0.50, 8 overlapping courses |
| Foot pad centres (world-aligned corners) | (±0.88, ±0.88) |
| Foot pad size | 0.39 × 0.35 × 0.084 |
| Lamp | r ≈ 0.82 at ~82°, can + visor + recessed lens |
| Service hatch | +X sector, ~0.31 × 0.16, proud on collar |

Hooks:

- `ring_spin` at the spin-ring origin `(0, 0, 0.85)`. Children rotate. Feet, liner, hatch, lamp
  do **not** parent here.
- `lamp` at the hood/lens socket. Children: hood, socket, lens. Only the lens emits.

Budget: LOD0 ≤ 8,000 tris, LOD1 ≤ 2,000, LOD2 ≤ 600. Maps: authored 1024² basecolor / normal /
ORM on LOD0. LOD1/LOD2 keep the hole, the four-foot silhouette, and both hooks.

---

## Material bill (preflight)

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
Working scene: `tools/blender/build_works_massline_core.py`.

| Zone | Disp. | Substrate / process | Finish | Optical | Forbidden |
|---|---|---|---|---|---|
| Collar / feet / hood paint | billed | Formed steel plate, welded courses | Dark alkyd `#2a2622`–`#3a3530`, dielectric | Rough 0.48–0.68, metal 0.08–0.18 | Safety yellow; shiny plastic; leather |
| Wear metal (races, bolts, lug faces, hatch lip) | billed | Machined steel, grease, abrasion | Bare `#6a6e74`–`#8a9098` | Rough 0.28–0.46, metal 0.72–0.88 | Uniform edge-wear recipe; chrome |
| Well liner | billed | Dry refractory / sintered mineral | Dusty brown-grey `#3a322c`–`#4a4038` | Rough 0.78–0.92, metal 0.02–0.08 | Metal paint; grid; glowing well |
| Service accent | billed | Primed hatch strap / ID plate | Restrained warm oxide `#6a4a32` | Rough 0.50–0.62, metal 0.20–0.35 | Yellow; large orange brick |
| Lamp lens | billed | Recessed dielectric | Warm `#f0dcb0`, **emissive only here** | Rough 0.18–0.28, metal 0.02 | Emissive ring, paint, or torus |
| Pad underside / rock interface | billed | Scaled mill scale, fines | Darker than pad top | High rough, low metal | Floating; no contact |

World: dark. Key `0xffdcbc` raking, real shadows, cool rim, weak fill, ≈5:1 key:fill on the
pad. Bevels must exist. The well must be a hole the key cannot fill.

Shape-grammar failure of the stand-in: **emissive torus on a hex column**. Replacement
sequence: open thick liner → segmented channel collar → four gusseted corner feet →
separable lug ring → one hooded lamp → one repair hatch. Clay must read that without
textures.

---

## Quality axes (grade these, not taste)

1. **Planform at 120 px/cell** — hole + segmented collar + four feet, not a coin/halo.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Well is a hole** — open through, thick liner, dark in the mouth.
4. **`works_edge` shows side depth** — channel walls, foot thickness, not a decal.
5. **Yellow discipline** — zero safety-yellow pixels.
6. **Lamp is a lamp** — hood/lens/socket; emissive off still reads as a fixture.
7. **`ring_spin` is separable** — rotating the hook does not move feet, liner, or lamp.
8. **Manufacture** — courses, fasteners at interfaces, one asymmetric hatch; no occupancy fins.
9. **LOD** — LOD1/LOD2 keep hole, feet, lamp, ring hook; no collapse-decimate of the hole.

Cycle 02 remaining risk: course-gap and four-corner notch hold at 19 px/cell; lamp can vs
metal highlight; inner race staying visually separate from the collar. Independent review
is still `review_pending`. Do not treat this cycle as KEEP.
