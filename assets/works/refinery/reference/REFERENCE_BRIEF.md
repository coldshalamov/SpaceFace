# Works refinery — Cycle 01 reference brief

**Asset:** `place_works_refinery` (PQ-131.04). **Class:** place / station module, works camera only.
**Tier:** B (one-cell process machine). **State:** `design_candidate`. Cycle 01 of ≥5.
G1/G2/G4 whole-asset stay open; this cycle records `review_pending` and does not launch reviewers.

Supported cameras (live `spaceface_works_camera.py`, never a studio three-quarter):

| Still | Camera | Size |
|---|---|---|
| `works_top` | straight down, 31° persp, 120 px/cell | 1920×1080 |
| `works_edge` | same camera; **object** offset to the frame edge | 1920×1080 |
| `works_site` | same camera, 19 px/cell | 1920×1080 |

Origin at cell centre. +Z up. Underside on the cut face (`z = 0`). One cell = 2.2 wu. Envelope must
stay inside ±1.1 wu in X and Y. Beauty stills shoot the slit **inactive / low**; a separate state
diagnostic may show emission at 1.

---

## Cited local references (form and material only — do not copy geometry or textures)

These three stills are the contact-sheet sources. They are **construction and material language**, not
a silhouette to trace and not a texture to project.

1. `assets/concept/archetypes/concept_station_refinery.jpg`
   Stacks as oxidized vertical flues with hoop courses; pipe runs as real elbows with fittings, not
   floating hoses; rust/heat as causal staining on metal, not a dirt overlay.
2. `assets/concept/archetypes/concept_station_mining.jpg`
   Furnace as a thick insulated body with a **brick/refractory mouth you can look into**; the glow
   lives inside a cavity, not on the skin. Heavy industrial casing, service plumbing, no cube-with-a-line.
3. `assets/concept/landmarks/concept_landmark_driller.jpg`
   Mining-site massing: dark oxidized steel, worn plate, equipment that occupies rock rather than
   hovering as an icon. Confirms the mine and the flight world share one metal language.

Supporting form-only citations (not on the sheet; do not import):

- `assets/incubator/everyday_space_kit/source/slurry_tank.glb` — process vessel on real saddles/feet,
  not a drum glued to a pad.
- `assets/incubator/everyday_space_kit/source/crusher_module.glb` — compact industrial module with
  service faces, not a decorative crate.

**Forbidden as identity:** rover safety yellow (`#ffd23f`); the rover is the only yellow object in
the mine. Do not copy incubator meshes, UVs, or maps.

Contact sheet: `assets/works/refinery/reference/CONTACT_SHEET.png`.

---

## Fiction (ART EXTRAPOLATION unless noted)

A **one-cell ore-roast / matte-hold refinery** bolted to a bored gallery floor. Helix/MTS claim
crews roast crushed seam-feed in a small insulated furnace, dump off-gas up a rooted flue, and hold
hot slurry in a saddle tank until a lane takes it. Canon: Helix Directorate + MTS ore trade; this
exact cell machine is extrapolated for Asteroid Works (`design/ASTEROID_WORKS_DESIGN_LAW.md` §2.7,
`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §4 `.04`).

It is a **process train**, not a shrine, not a tank farm, not a chimney on a box.

| Assembly | Manufacture |
|---|---|
| Furnace casing | Formed mild-steel jacket over ceramic-fibre / refractory blanket. Rolled and welded courses, insulation straps with service clamps. Dark alkyd over zinc phosphate. |
| Crown slit / throat | Cast refractory ceramic block set into the jacket. Recessed charging / sight slit with a steel lip. Inner walls are dry ceramic; they do not emit. |
| Ember lens (`furnace_slit`) | Small recessed ceramic-glass throat plate at the well floor. The **only** furnace emissive. Runtime 0–1. Surrounding faces stay dielectric ceramic / paint. |
| Burner / manifold | Bolted plenum on the service long-side: fuel/air manifold, three nozzle throats, flange, hinged access lid. Heat-stained bare steel. |
| Flue and stack | Rectangular takeoff from the furnace shoulder, rect-to-round transition, mitered elbow, tapered stack with hoop rings, rain cap and internal baffles. `stack_vent` sits at the **actual outlet** under the cap, after the flue path, not at an arbitrary apex. Oxidized / scaled metal. |
| Process pipe | Fabricated run with mitered elbows, flanges, and saddle clamps. Terminates in a tank nozzle fitting. Heat-stained metal; clamps painted with the structure. |
| Process tank | Rolled shell, dished heads, two formed saddles on base plates, top manway. Oxide-red industrial paint, not yellow. |
| Feet | Four tapered structural feet with gussets, welded to the jacket skirt, bearing on the gallery floor. |
| Lamp | One hooded work-light: socket, lens, hood. Never a halo, bar, or neon outline. |

---

## Silhouette from directly above (the only view that matters)

At 120 px/cell the object occupies ~120 px square. If the outline is a beige rounded rectangle with a
glowing line, a chimney glued to a box, a sci-fi altar, or a tank farm, the asset has failed.

Four masses a person must name at that size, with **open channels** between them (do not pad the
cell with connecting occupancy):

1. **Furnace** — largest mass, formed insulated casing (waist + crown, not a cube). A **dark
   rectangular slit** in the crown: a hole with a lip, not a painted stripe.
2. **Stack** — circular flue disk offset on the service side, visibly rooted by a short flue, with a
   cap. Gap of empty gallery between stack and furnace body except at the flue neck.
3. **Tank** — smaller vessel on two saddles, offset on the opposite diagonal. Empty gallery between
   tank and furnace except where the pipe actually runs.
4. **Pipe** — a real run with elbows/fittings, not a torus and not a floating hose.

The lamp is a small hooded fixture, readable at edge, not a planform mass.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **≤ 2.2 × 2.2**, height set by the stack (~1.15 wu). Origin at cell centre.

| Part | wu (approx) |
|---|---|
| Envelope L × W × H | ≤ 2.10 × 2.10 × 1.20 |
| Furnace jacket (plan) | ~1.12 × 0.82, crown ~0.72 tall |
| Slit mouth (plan) | ~0.46 × 0.14, well depth ~0.28 |
| Stack | Ø ~0.28, outlet ~1.12 above floor |
| Tank | Ø ~0.34, length ~0.70 on saddles |
| Pipe OD | ~0.055 |
| Feet bearing | z = 0 |

Root node: `SF_WORKS_REFINERY_V1`.
Hooks (exact names): `furnace_slit`, `stack_vent`, `lamp`.
LOD roots: `LOD0_refinery`, `LOD1_refinery`, `LOD2_refinery`.

---

## Material bill (preflight)

| Zone | Disposition | Substrate | Finish | Forbidden reads |
|---|---|---|---|---|
| Jacket / feet / straps / door | billed | mild steel plate | dark cool paint, dielectric | beige cube, plastic, safety yellow |
| Slit lip | billed | steel | paint with heat wear | glowing outline |
| Well walls | billed | dry refractory ceramic | tan/buff, high roughness, metallic 0 | chrome, neon, emissive brick |
| Ember lens | billed | ceramic-glass | recessed, emissive 0–1 only here | disk on the crown, bloom-as-shape |
| Burner / flue metal | billed | bare steel | heat-stained straw/blue, metallic | plastic grey |
| Stack / cap / baffles | billed | mild steel | oxidized scale, metallic | chimney-on-a-box, glowing rim |
| Tank shell / saddles | billed | steel | oxide-red paint, dielectric | rover yellow, generic drum |
| Pipe / flanges | billed | steel | heat-stained, dielectric clamps | default torus, floating hose |
| Lamp hood / socket | billed | steel + glass lens | small fixture | halo, bar, neon |
| Hidden undersides | outside_supported_view only if absent from top, edge, and site | — | — | do not skip feet (edge sees them) |

`componentReferenceDecision`: `not_needed` for generated component studies. Local concept stills and
incubator modules are cited as form/material language. No imagen projection. No donor textures.

---

## MTX class (place / station module)

Mandatory: MTX-01, MTX-03, MTX-16, MTX-20–25, MTX-30–33, MTX-39, MTX-46, MTX-50, MTX-52–54.
Ledger bound to the exported candidate hash. Clay must read as a connected manufactured process
before any surface row is `implemented`.

---

## Budget

| LOD | Tris | Purpose |
|---|---|---|
| LOD0 | ≤ 8,000 | works_top / works_edge construction |
| LOD1 | ≤ 2,000 | works_site: keep furnace/slit, stack, tank, pipe, hooks |
| LOD2 | ≤ 600 | silhouette of the same train |

Textures: authored 1024² basecolor / normal / ORM (OpenGL, R=AO G=Roughness B=Metallic). Unique
non-overlapping UV0. Mesh-derived normal / AO / curvature. No generic grid/noise, no shiny plastic,
no leather, no decal cavity, no neon.

Hidden-face analysis: **per LOD only** (`works_visible_faces.py`). Do not evaluate coincident LODs
together.

---

## Cycle 01 completion (this packet)

Source candidate only. Do not wire, release, promote, push, or mark PQ-131.04 complete.
Disposition: `review_pending`. Independent reviewers are **not** launched from this cycle.
