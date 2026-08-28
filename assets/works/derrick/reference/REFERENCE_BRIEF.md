# Works surface derrick / head-frame — Cycle 03 reference brief

**Asset:** `place_works_derrick` (PQ-131.05). **Class:** place / station module, works camera only.
**Tier:** B (surface gateway of the mine). **State:** `design_candidate`. Cycle 03 of ≥5.
The exact-hash Cycle 02 review accepted structure, role, and load path, then returned `REVISE` for
two normal-camera defects only: lamp fixtures read as warm pinpricks at `works_top`, and the four
shoes collapsed into a dark square frame at `works_site`. Cycle 03 changes only those outcomes.
G1/G2/G4 whole-asset stay open; the Cycle 03 exact candidate remains `review_pending`.
Cycle 01/02 evidence is frozen.

Supported cameras (live `tools/blender/spaceface_works_camera.py`, never a studio three-quarter):

| Still | Camera | Size |
|---|---|---|
| `works_top` | straight down, 31° persp, 120 px/cell | 1920×1080 |
| `works_edge` | same camera; **object** offset so the A-frame height reads | 1920×1080 |
| `works_site` | same camera, 19 px/cell | 1920×1080 |

Origin at cell centre. +Z up. Base-shoe undersides on the cut face (`z = 0`). One cell = 2.2 wu.
Footprint stays inside ±1.10 wu in X and Y. Height ≈ 3 cells (~6.4 wu). The edge view is
load-bearing for that height. Site must still read as the **surface gateway over the shaft**.

Identity / export:

- Blender root / contract: `SF_WORKS_DERRICK_V1`
- LOD roots: `LOD0_derrick`, `LOD1_derrick`, `LOD2_derrick`
- Hooks (empties, exact names): `drum_spin`, `cable_anchor`, `lamp_L`, `lamp_R`
- Candidate part: `assets/ships/parts/works/place_works_derrick.glb`

The rover is the **only** safety-yellow object in the mine. This asset never wears `#ffd23f`.

---

## Cited local references (geometry and textures are NOT imported)

These three kit stills plus the live procedural stand-in are the only image/code authorities for
form. They are cited, not sampled. No vertex, UV, or texel is copied onto the candidate.

| # | Exact local path | What is selected | What is rejected |
|---|---|---|---|
| 1 | `assets/incubator/everyday_space_kit/source/drill_platform.glb` and `assets/incubator/everyday_space_kit/evidence/drill_platform.png` | A deck that **straddles a vertical well**, load going down through legs into **base shoes**, open negative space under the ring. | Beige house cube, glowing sphere, lattice outriggers as identity, ochre pads as livery, any imported mesh. |
| 2 | `assets/incubator/everyday_space_kit/source/extraction_mast.glb` and `assets/incubator/everyday_space_kit/evidence/extraction_mast.png` | A **tall surface mast** whose job is to stand over a feed, paired fixtures at the crown, a rooted base. | Radio-tower lattice, one glowing ball, a hose-to-a-box, chrome truss, toy crane. |
| 3 | `assets/incubator/everyday_space_kit/source/worklight_tower.glb` and `assets/incubator/everyday_space_kit/evidence/worklight_tower.png` | **Two hooded work lamps** as housings with a downward mouth, not bars of light; a mast that exists to hold lamps. | Glowing spheres, single-truss identity, yellow pad as body paint. |
| 4 | `src/render/asteroidInteriorPreview.js` `makeDerrick` (stand-in to beat, not a donor) | Two A-legs over the entry shaft, a drum that the umbilical actually leaves, weathered **works orange as paint not yellow**. | Box-geometry legs, one sphere beacon, no platform, no bearings, ~1.5-cell height, glued cross-brace. |

Supporting material language (not on the contact sheet; do not import):

- `assets/concept/archetypes/concept_station_mining.jpg` — dark painted steel, hazard colour used as **markings on edges**, hooded lamps, heavy joints. Reject molten-metal identity and yellow as a body.
- `assets/concept/landmarks/concept_landmark_driller.jpg` — oxidised industrial mass, railed platforms, bolted plate. Reject the giant auger and wrecked-ship silhouette.

Contact sheet (composed at build time from the three kit stills, labelled, never projected):
`assets/works/derrick/reference/CONTACT_SHEET.png`.

`componentReferenceDecision`: `not_needed` for whole-asset imagen. Native cited stills name the
manufacture. Frozen identity is the envelope and hooks in this brief, not the cited pixels.

---

## Fiction (ART EXTRAPOLATION unless noted)

A **Helix/MTS surface head-frame** planted on the asteroid crust over the entry shaft — the place
the player came in. Canon: Helix Directorate + MTS ore trade and Asteroid Works design law §2.7 /
campaign §4 `.05`; this exact pattern is extrapolated. It is a **winch head-frame**, not a radio
tower, not an oil pumpjack, not a generic truss, not a toy crane, not a flat arch, not a box stack.

Two manufactured A-frame leg pairs straddle the shaft as **open A** (one A-bar and splice plates;
no rung/ladder-truss fill, no X-grid). A rooted winch drum on the −X skid pays the umbilical at a
visible tangent, over a **crown head sheave**, then down the empty well. A small grated service
platform with guarded access sits offset on +X — not a roof. Two hooded work lights look into the
shaft. Orange exists only as restrained edge wear and one kick-plate mark; never yellow-black shoe tape.

| Assembly | Manufacture |
|---|---|
| A-frame legs | Wide-flange I-beam (rolled section), splice plates at mid-height, gusseted into shoes and into a crown knee. Dark alkyd over zinc phosphate. |
| A-bar / splice | One I-strut per A-plane at mid-height; splice plates on the web at the joints. No diagonals, no rungs. |
| Portal | Crown beam plus one platform-side portal. Nothing crosses or fills the well. |
| Base shoes | Folded plate pads with stiffener gussets, exposed metallic anchor plates, and a bolt circle into the crust. Underside at z = 0. No yellow-black stripe or outline padding. |
| Shaft collar | Short circular curb around the open well; the hole is empty; the drum does not sit on it. |
| Winch / drum | Machined drum with flanges, through-spindle, two pillow-block bearings on a −X skid. Heat/oil around the gearbox. Parent: `drum_spin`. |
| Head sheave | Grooved wheel in cheek plates on the crown beam. Turns the cable from the rise into the shaft. |
| Cable / umbilical | Coils on the drum; leaves at the **payout tangent** (`cable_anchor`); rises to the sheave; drops through the collar. Greasy jacket, not a laser. |
| Service platform | Grated floor (modelled bars), kick plate, two-rail guard, ladder from a +X shoe. Dry galvanised / dusty. |
| Lamps | Hollow cast hood + socket + physically recessed lens, one port, one starboard on the crown. The dark rim is readable before the restrained lens; only the lens emits. Parents: `lamp_L`, `lamp_R`. |
| Fasteners | Modelled hex heads at shoe/leg, bearing/skid, and platform brackets. Not texture studs. |

---

## Silhouette from the supported cameras

At `works_top` the cell is ~120 × 120 px. If the outline is a radio mast, a pumpjack, a flat arch,
a lattice stick, or a box on stilts, the asset has failed.

Five shapes a person names from above:

1. **Dark shaft well** — a real hole in a collar, not a painted disc, not covered by the drum.
2. **Four shoes** — pads at the corners, the load path into the crust.
3. **Two open A-frames** — four legs converging to a crown beam; negative space inside each A and between the pair. Not an X-grid.
4. **Causal winch path** — flanged drum on −X, cable leaving a visible tangent, crown sheave, descent into the hole.
5. **Small grated platform** — offset +X, guarded, not a roof. Two lamp **hoods** (rim + mouth), not pinpricks.

At `works_edge` the same camera with the object at the frame edge must show **three-cell height**
and the A-spread (legs leaning in). At `works_site` (~19 px/cell) four shoe corners, an open central
shaft marker, and a tall head-frame mass must still read. No camera enlargement. A filled rounded
square is a failure.

Clay must hold those masses without textures.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **≤ 2.20 × 2.20 × 6.50 wu**. Origin at cell centre.

| Part | wu |
|---|---|
| Envelope X × Y × Z | ≤ 2.18 × 2.18 × 6.45 |
| A-frame planes Y | ±0.70 |
| Foot centres X | ±0.88 |
| Shoe pad | 0.36 × 0.30 × 0.10, underside z = 0 |
| Crown / head beam | z ≈ 6.20, span along Y |
| Shaft collar inner / outer | 0.36 / 0.54 |
| Drum centre | (−0.62, 0.00, 1.38), r ≈ 0.20, length ≈ 0.68 along Y |
| `drum_spin` | drum origin |
| `cable_anchor` | visible leaving tangent on the drum, toward the sheave |
| Head sheave | (0.00, 0.00, 6.36), r ≈ 0.11 |
| Platform | z ≈ 5.38, +X offset, ~0.48 × 0.60, not over the well |
| `lamp_L` / `lamp_R` | crown, Y ±0.40, hoods tilted toward the well |

Hooks:

- `drum_spin` at the drum origin. Children: drum shell, flanges, spindle. Bearings stay on the skid.
- `cable_anchor` on the actual leaving tangent of the drum, toward the crown sheave.
- `lamp_L`, `lamp_R` at the hood/lens sockets. Only the lenses emit.

Budget: LOD0 ≤ 12,000 tris, LOD1 ≤ 3,000, LOD2 ≤ 900. Maps: authored **2048²** basecolor / normal /
ORM on LOD0 (1024 / 512 on LOD1 / LOD2). LODs keep A-frame, drum/cable tangent, platform, and lamps.

---

## Material bill (preflight)

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
Working scene: `tools/blender/build_works_derrick.py`.

| Zone | Disp. | Substrate | Finish | Forbidden reads |
|---|---|---|---|---|
| Legs, braces, shoes, crown, hoods | billed | mild-steel I / plate | dark cool alkyd, dielectric | rover yellow, chrome, plastic, lattice stick |
| Weld plates / bolt interfaces | billed | bare steel | worn, metallic, grease | texture studs, universal rust |
| Drum / spindle / gearbox | billed | machined steel | oil/heat stain, metallic | floating cylinder, chrome |
| Bearings | billed | cast housing + machined race | oxide + grease | drums glued to a beam |
| Collar / well | billed | painted steel curb, empty hole | dark, dusty | filled disc, halo |
| Grating / platform deck | billed | galvanised bar / dusty steel | dry, high roughness | solid box deck, card |
| Kick edge marking | billed | alkyd marking | restrained **works orange** on the kick only | safety yellow `#ffd23f`, yellow-black shoe tape |
| Shoe / structure edges | billed | dark alkyd + orange edge wear in the map | wear, not a stripe mesh | hazard chevrons, rover yellow |
| Cable jacket | billed | greasy composite | dark, rough, dielectric | neon, laser, glowing line |
| Lamp lens | billed | warm glass, recessed | only legal emissive | glowing bar, sphere, halo |
| Hidden shoe undersides | billed (edge sees shoes) | steel | paint + dirt | floating legs |

World: dark. Key `0xffdcbc` raking, real shadows. Rim `0x9db8f0` weak. Fill `0xd8c3a8` weak.
≈5:1 key:fill. Bevels must exist. Cavities must be real. Orange is a marking, not a light.

G0–G7: Cycle 03 is `evidence_ready` / `review_pending` only. G1/G2/G4 whole-asset remain open.

---

## MTX class (place / station module)

Mandatory: MTX-01, MTX-03, MTX-16, MTX-20–25, MTX-30–33, MTX-39, MTX-46, MTX-50, MTX-52–54.
Ledger bound to the exported candidate hash. Clay must read as a connected manufactured head-frame
before any surface row is `implemented`.

---

## Quality axes (grade these)

1. **Planform at 120 px/cell** — hole, four shoes, two A-frames, drum, offset platform.
2. **Edge height** — three-cell A-spread, not a squat arch.
3. **Clay vs textured** — form holds in `works_top_clay.png`.
4. **Causal winch path** — flanges, spindle, pillow blocks, visible tangent, crown sheave, drop into the hole.
5. **Platform is grated and guarded** — bars, kick, rails, ladder; not a slab roof.
6. **Lamps are fixtures** — hollow dark hood / socket / recessed lens; readable with emission off at 120 px, not a warm pinprick.
7. **Orange discipline** — edge wear + one kick mark; never rover yellow; never yellow-black shoe tape.
8. **Hooks / envelope / LOD** — 4/4 names; bbox inside the cell; LOD1/2 keep four distinct physical shoe/anchor masses, open shaft, A, drum/sheave, platform, lamps.

Cycle 03 close conditions: `works_top` must show two dark hood masses surrounding smaller recessed
warm lenses; `works_site` must show four separate corner shoes around the dark collar hole. Neither
result may come from camera enlargement, glow, outline, or footprint padding.
