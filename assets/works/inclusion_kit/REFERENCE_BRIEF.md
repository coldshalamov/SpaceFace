# Works inclusion kit — Cycle 01 reference brief

**Asset:** `place_works_inclusion_kit` (PQ-131.10). **Class:** place/prop kit, works camera only.
**Tier:** C (repeated geological/process family; one billed family per ore/process, not a DCC default).
**State:** `design_candidate`. Cycle 01 of ≥5. This page is the contract for later cycles.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same, object at frame edge), `works_site`
(19 px/cell). All 1920×1080, 31° perspective, +Z up, origin at the instancing pivot on the cut face.
Never orthographic. No fog. No studio three-quarter. Owner: `tools/blender/spaceface_works_camera.py`
matching live `src/ui/asteroid/asteroidRenderer3d.js`.

Stand-in for scale: the procedural kit in `src/render/asteroidInteriorPreview.js` (PQ-130.04), which
this unit **replaces as an authored source kit** and does not wire this cycle. A works cell is
`S = 2.2` wu. Inventory row `.10`: footprint **≤ 0.7 cell** → **≤ 1.54 wu** XY, one instanced mesh
per variant, 1–3k triangles at LOD0, shared 2048² atlas.

Do not import live rock maps, rover textures, or procedural geometry. This kit is original.

---

## Authorities (cited; user direction wins on conflict)

| Claim | Source |
|---|---|
| Congruous 3D, never cartoon; no emissive rings/halos; raking dusk key | `design/ASTEROID_WORKS_DESIGN_LAW.md` §2.7 |
| Three channels at once: hue + surface pattern + **inclusion shape** | Law §3.5 |
| Board palette (matrix / basalt / ice / iron / exotic / gas / vented) | Law §3.5 table |
| Iron = rust host + branching metallic vein + angular chips | Law §3.5 |
| Ice = pale glassy plates, the one cold material | Law §3.5 |
| Exotic = obviously-not-normal violet lattice, visible prize | Law §3.5 |
| Gas = cracked breathing cell, dark centre, danger never treasure | Law §3.5; renderer comment block “GAS IS DANGER, NOT LOOT” |
| Vented pocket = permanently dead gray-green split | Law §3.5, D2 permanence |
| MK lock = engraved stamp on a dull vein, not an 8px sprite | Law §5; playfield §5.5 |
| Kit inventory, budget, instancing | `design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §4 row `.10` |
| Works camera, scale, LOD-by-name, do not wire this cycle | `design/program/roadmap/active/PQ-131.md` |
| Host-rock inclusion is object-space mineral, not UV wallpaper or emissive cue | `src/render/objectSpaceGeology.js` |
| Common-rock microstructure is a **separate** flight map; do not import it | `src/render/rockSurfaceLibrary.js` |
| Metal family currently shares one procedural shape; hue is not enough | `asteroidRenderer3d.js` `ORE_FAMILY` / `ORE_SURFACE` |
| Commodity map: silverium=Ag, goldium=Au, iron=Fe, bronzium=Ni | `ORE_SYMBOL` |
| Vanilla collapse (recolor, bevel the boxes, billboard, emissive outline) is illegal | Campaign §6 |
| Form, unique UVs, mesh bakes, authored surfaces, LOD | `docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` |
| Material-truth preflight; emission-off identity | `.grok/skills/spaceface-blender-material-truth/SKILL.md` |
| Rover kit precedent (atlas, LOD names, works stills, cycle evidence) | `assets/works/rover/` + `tools/blender/build_works_rover.py` |

`componentReferenceDecision`: `native_imagegen`. Frozen identity is the law silhouettes and the
numbers below, not the generated pixels. Selected traits: host seating, facet language, dark mouths,
hinge/latch/anchors. Rejected: neon, plastic crystals, floating shards, camera-facing cards, labels
as separate objects.

---

## Fiction (ART EXTRAPOLATION unless noted)

Inclusions are **what the cut face shows of a body already in the rock** — not pickups, not VFX, not
UI. Metals keep **host-rock inclusion logic**: ore is mineral in matrix, exposed where a vein or
cavity meets the cut. Gas is a sealed pocket whose face has split. Ice is a film/vein that froze
against the silicate. Exotics are a deep lattice that does not belong in ordinary strata. The MK
plate is **claim hardware** bolted to a locked vein; the vented scar is the **spent pocket** after a
breach (law D2: butchered forever).

Canon commodities (live ids, not invented): `cmdty_ore_silverium`, `cmdty_ore_goldium`,
`cmdty_ore_iron`, `cmdty_ore_bronzium` (Ni). Exotic maps to the deep/gem/exotic family
(`cmdty_ore_einsteinium` and gems). Ice maps to `cmdty_gem_diamond` as the law's cold material.
Process pieces (scar, lock) are presentation objects driven by sim events, not ores.

Geological habits used as manufacture (ART EXTRAPOLATION, cited as Earth-analog process not
in-fiction brand):

| Family | Process | Inclusion shape (the third channel) |
|---|---|---|
| Silver | Native metal, hydrothermal; wires and sheets | Flattened dendrite wires vs overlapping sheet-flakes in pale silicate |
| Gold | Native metal, ductile; leaves in quartz | Crumpled leaf nest vs sigmoid fracture ribbon |
| Iron | Oxide/magnetite in mafic host | Forked angular-chip ridge vs stacked specular hematite plates |
| Nickel | Massive pentlandite in ultramafic | Interlocking cubes vs cubic-terminated dendrite |
| Exotic | Hopper / octahedral / prismatic growth | Octahedral cage, hexagonal prism truss, skeletal hopper cube |
| Ice | Dielectric film and filled fracture | Conforming chipped plate vs trapped-fracture vein |
| Gas | Pressurized pocket at the cut | Radial dark mouth, branching crevice, shear-offset slot |
| Scar | Blast-split spent pocket | Two levered lips around a dead cavity |
| Lock | Stamped steel claim plate | Anchors, hinge, latch, gasket, recessed MK2 |

---

## Silhouette from directly above (the only view that matters)

A stranger at 120 px/cell names the family with **shape**, not hue. At 19 px/cell the same shapes
still differ. If four metals are the same blob in four tints, the kit has failed.

1. **Silver wire** — bright branching stroke, thin, connected, pale host.
2. **Silver sheet** — overlapping flakes, broader than wire, same pale host.
3. **Gold leaf** — crumpled yellow patches around a milky S-shaped quartz fill.
4. **Gold ribbon** — one sigmoid metal fill, fewer flakes, thicker ductile body.
5. **Iron chip ridge** — Y-forked rust crest with dark angular chips on it.
6. **Iron specular** — stacked dark plates, planar, no Y-fork.
7. **Nickel cubic** — blocky interlocking mass on dark host, greasy, not rusty.
8. **Nickel dendrite** — branching cubes, cooler metal, not a Y-ridge.
9. **Exotic cage** — regular octahedral strut silhouette, rooted crust.
10. **Exotic prism** — hexagonal outline with internal bars.
11. **Exotic hopper** — square stepped well (the “does not belong” stamp).
12. **Ice sheen** — pale irregular plate with bitten thickness.
13. **Ice vein** — linear ice fill with holes (trapped fracture).
14. **Gas radial** — dark elliptical mouth, cracks out.
15. **Gas branch** — Y dark slot, two mouths.
16. **Gas shear** — offset pair of lips, one dark slot.
17. **Vented scar** — split gray-green lips, dead gap, no prize.
18. **MK lock** — rectangle, four corner anchors, hinge vs latch handedness.

Yellow is **not** used. Safety-yellow is the rover only (law §4).

---

## Contract numbers

1 cell = 2.2 wu. Max footprint 0.7 cell = **1.54 wu** in XY. Origin = instancing pivot on the cut
face. +Z = surface normal (out of the rock). +X = arbitrary seam grain for veins. Collisionless.

| Token | Value |
|---|---|
| Master root | `SF_WORKS_INCLUSION_KIT_V1` |
| LOD mesh names | `LOD{0,1,2}_<VARIANT_ID>` |
| Atlas | original shared 2048² basecolor / normal / ORM, unique UV0 per bake target |
| Texel density | ~160 px/wu (256 px tile / ~1.5 wu), consistent across variants |
| LOD0 | 1–3k tris / variant, 1 draw (joined atlas mesh) |
| LOD1 | site mesh, ~30–45% of LOD0, keeps family silhouette |
| LOD2 | far instance, macro only |
| Emission | **none**. Identity survives emission disabled. |

Variant ids (deterministic, exact):

| id | family | form |
|---|---|---|
| `SF_INCL_SILVER_WIRE_V1` | silver | wire_dendrite |
| `SF_INCL_SILVER_SHEET_V1` | silver | sheet_flake |
| `SF_INCL_GOLD_LEAF_V1` | gold | leaf_nest |
| `SF_INCL_GOLD_RIBBON_V1` | gold | fracture_ribbon |
| `SF_INCL_IRON_CHIP_RIDGE_V1` | iron | chip_ridge |
| `SF_INCL_IRON_SPECULAR_V1` | iron | specular_plate |
| `SF_INCL_NICKEL_CUBIC_V1` | nickel | cubic_mass |
| `SF_INCL_NICKEL_DENDRITE_V1` | nickel | dendrite |
| `SF_INCL_EXOTIC_OCTAHEDRAL_CAGE_V1` | exotic | octahedral_cage |
| `SF_INCL_EXOTIC_PRISMATIC_TRUSS_V1` | exotic | prismatic_truss |
| `SF_INCL_EXOTIC_HOPPER_CUBE_V1` | exotic | hopper_cube |
| `SF_INCL_ICE_SHEEN_PLATE_V1` | ice | sheen_plate |
| `SF_INCL_ICE_FRACTURE_VEIN_V1` | ice | fracture_vein |
| `SF_INCL_GAS_FISSURE_RADIAL_V1` | gas | radial_mouth |
| `SF_INCL_GAS_FISSURE_BRANCH_V1` | gas | branch_crevice |
| `SF_INCL_GAS_FISSURE_SHEAR_V1` | gas | shear_offset |
| `SF_INCL_VENTED_SCAR_V1` | scar | vented_split |
| `SF_INCL_MK_LOCK_PLATE_V1` | lock | mk_lock_plate |

---

## Material bill (preflight)

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
Working scene: `tools/blender/build_works_inclusion_kit.py`. G0–G7: cycle 01 is `evidence_ready`
only. G1/G2/G4 whole-asset remain open. This unit does **not** wire, release, or close PQ-131.10.

| Zone | Disp. | Base (sRGB intent) | Rough | Metal | Wear / why | Dusk light |
|---|---|---|---|---|---|---|
| Host silicate (Ag/Au) | billed | `#7a6955` family | 0.78–0.88 | 0.04–0.08 | Fracture grain; dirt in seams | Warm key rakes bedding |
| Host mafic (Fe) | billed | `#6f5b48` rust | 0.82–0.92 | 0.08–0.18 | Oxide crust, metallic only on chips | Ridge casts a hard flank shadow |
| Host ultramafic (Ni) | billed | `#3a3c40` dark | 0.80–0.90 | 0.06–0.12 | Cooler than iron, no rust orange | Cubes sit in a dark socket |
| Host exotic | billed | `#352a4d` | 0.70–0.84 | 0.10–0.22 | Mineralised crust the lattice grows from | Lattice reads without emission |
| Host ice | billed | `#7a6955` showing through | 0.75–0.88 | 0.04 | Rock under thin ice | Ice is the pale plate, not the host |
| Host gas | billed | `#4a4a36` | 0.90–0.98 | 0.00–0.04 | Stained lips; mouth is a hole | Key cannot fill the mouth |
| Native silver | billed | `#bcc6d0` | 0.16–0.28 | 0.88–0.96 | Tarnish in wraps; clean on facets | Bright stroke, not a light |
| Native gold | billed | `#c9992f` → glint `#f0cf78` | 0.22–0.36 | 0.90–0.96 | Ductile crumple, thicker than silver sheet | Warm metal, dielectric host |
| Iron chips / specular | billed | `#9a6f4a` / dark hematite | 0.32–0.55 | 0.55–0.80 | Fresh break brighter; host stays rusty | Angular vs planar, not hue |
| Nickel sulfide | billed | `#63666c` greasy | 0.28–0.40 | 0.72–0.86 | Cube edges catch; faces stay oily | Cooler than iron, blockier than silver |
| Exotic lattice | billed | `#8f6ae0` pulled off the glint | 0.18–0.32 | 0.28–0.50 | Semi-metal; identity in topology | Must read with emission 0 |
| Ice film | billed | `#b9d6d8` / sheen `#e6f5f6` | 0.08–0.22 | 0.00 | Chips show thickness; trapped fracture is holes | Dielectric; not metal, not glow |
| Gas mouth | billed | `#2b2d1f` | 0.95–1.00 | 0.00 | Real cavity, inner walls | Dark because unlit, not painted black |
| Gas lip / vent cue | billed | `#4a4a36` stain `#9caa4a` | 0.85–0.95 | 0.02–0.06 | Restrained; never a glowing line | Geometry, not a card |
| Vented scar | billed | `#4a463f` | 0.94–0.98 | 0.02–0.06 | Spent, no prize | The dullest object on the sheet |
| Lock steel / bezel | billed | `#6d6355`–`#7d7263` | 0.34–0.48 | 0.70–0.82 | Machined, scratched | Rake across chamfer |
| Lock pane / engrave | billed | `#3b332a` + bone cut | 0.40–0.55 | 0.55–0.70 | Recessed MK2 is a groove | Readable at 120 px without a sprite |
| Lock gasket / anchors | billed | dark dielectric / hex steel | 0.55–0.85 | 0.10–0.80 | Rock contact is a real ring | Hinge vs latch is handedness |

**Forbidden reads:** one recolored cluster for four ores; plastic crystals; uniform sparkle; Voronoi-
only crust; camera-facing cards; radial glows; floating shards; floating labels; glowing gas lines;
emissive exotic; ice as metal; nickel as rusty iron; lock as a decal quad.

AO roots pieces into cracks and host contact. Exposed facets stay clean.

---

## Quality axes (grade these)

1. **Family silhouette at 120 and 19 px/cell** — shape, not hue.
2. **Clay vs textured** — metals still differ in clay.
3. **Host seating** — nothing floats; gas mouths go into the face.
4. **Emission-off** — exotic, ice, gas, lock, scar still distinct.
5. **Lock is hardware** — anchors, hinge, latch, gasket, contact.
6. **Scar is spent** — dead split, not a second exotic.
7. **UVs / atlas** — unique UV0, mesh-derived N/AO/curvature, 2048² shared.
8. **LOD** — named roots, cheaper instancing LODs, no collapse-decimate fake.

---

## Component references (native_imagegen)

| File | Subject | Selected | Rejected |
|---|---|---|---|
| `ref_01_silver_wire_sheet.jpg` | Native Ag wires + sheets in pale host | Flattened dendrite + flake seating | Jewelry glow, floating foil |
| `ref_02_gold_leaf_ribbon.jpg` | Au leaves around milky quartz S | Ductile crumple, quartz fill | Paint gold, emissive |
| `ref_03_iron_chip_ridge.jpg` | Y-ridge, octahedral chips in rust host | Fork + angular chips | Recolor of silver |
| `ref_04_nickel_cubic_mass.jpg` | Pentlandite cubes on dark host | Greasy cubes, dark socket | Pyrite-gold confusion |
| `ref_05_exotic_hopper.jpg` | Hopper cube, stepped well | Topology as identity | Neon spikes, plastic |
| `ref_06_ice_sheen_plate.jpg` | Chipped conforming film | Thickness, polygonal chips | Soft card, metal sheen |
| `ref_07_gas_fissure_mouth.jpg` | Dark mouth, radial cracks | Cavity, unlit centre | Glow line, vapor sprite |
| `ref_08_mk_lock_plate.jpg` | Plate, bolts, hinge, latch, MK2 | Hardware on rock | Billboard stamp |

Generated pixels are quality targets under frozen identity. They are not imported as textures.

---

## Cycle 01 scope

Author the master kit, per-variant GLBs, shared atlas, works-camera cycle sheets, diagnostics, hashes.
Do not wire `loadWorksPart`, do not edit renderer/manifest/release, do not mark PQ-131.10 complete.
G1/G2/G4 stay open pending independent review of `evidence/cycle_01/` at 1:1.
