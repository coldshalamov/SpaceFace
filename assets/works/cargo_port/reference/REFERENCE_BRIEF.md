# Works cargo port — cycle 01 reference brief

**Asset:** `place_works_cargo_port` (PQ-131.09). **Class:** place/prop, works camera only.
**Tier:** C (supporting modular machine; one manufactured logistics cell). **State:** `design_candidate`.
Cycle 1 of ≥5. This page is the contract for later cycles. It is a source candidate only — not wired,
not released, not accepted.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same, object at frame edge), `works_site`
(19 px/cell). All 1920×1080, 31° perspective, +Z up, origin at cell centre, structure feet at z = 0.
Never orthographic. No fog. No studio three-quarter.

Stand-in for scale: procedural `makeMachine('cargo_port')` in `src/render/asteroidInteriorPreview.js`
(torus collar + capsule) and `makeCrateStackGeo` / `makeCourierPodGeo`. Live launch in
`src/ui/asteroid/asteroidRenderer3d.js` slides a separate pod up the entry shaft
(`ENTRY_COL`, Three.js +Y toward the derrick, `POD_RISE_S = 1.7`). That runtime is not this write set.

Authorities cited: `design/program/roadmap/active/PQ-131.md`;
`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §2, §4 row `.09`;
`design/ASTEROID_WORKS_DESIGN_LAW.md` §2.7, §4, §5 (courier launch), §7 (port stacks crates);
`src/data/sites.js` `sm_cargo_port`; `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`;
`.grok/skills/spaceface-blender-material-truth/SKILL.md`;
`docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` (place class);
`tools/blender/spaceface_works_camera.py`.

---

## Launch direction (committed)

**Authored launch axis is Blender +Z (glTF +Y after Y-up export), through the open collar well.**

Fiction: this cell is a skip-loading collar over a bored shaft. The courier capsule seats in the
cradle spanning that well, nose toward space (+Z), aft toward the well floor. Runtime later translates
`pod_root` along +Z to climb the shaft. `pod_thruster` travels with the pod.

The live theater still flies a board-plane pod along the entry column. This candidate documents a
cell-local shaft axis the machine itself can own. Do not silently retarget `pod_root` to +Y.

Seated pose: pod barrel clamped in the cradle, aft thruster recessed above the well floor.
Launch-clear pose: `pod_root` translated +Z until the aft skirt clears the collar flange.

---

## Fiction (ART EXTRAPOLATION unless noted)

Canon (`src/data/sites.js`): the cargo port is “the honest interface between the bore and the
outside: buffers export goods and launches courier pods. The laser never touches refined output.”
Law §7: the port stacks visible crates as output accumulates. Law §5: a courier launch is a pod
that visibly climbs the shaft and clears the surface.

This specific Helix/MTS skip-collar pattern, crate family, and capsule tooling are ART EXTRAPOLATION.
It is field logistics hardware, not a shrine, vending machine, toy rocket, or glowing hatch.

| Assembly | Manufacture |
|---|---|
| Collar / well liner / feet / apron | Folded 4–6 mm oxide-coated structural plate, welded then hex-bolted overlapping flanges. Dark, not yellow. |
| Guide rails | Drawn steel channel, bolted to well flats, grease at the shoe path. |
| Cradle | Machined saddle and clamp jaws; bright wear at contact; load path into a beam that spans the well. |
| Crates | Pressed polymer/paint shells on steel frames; corner irons, lid straps, recessed handles, skid feet. Five members of one family, not five cubes. |
| Pod pressure shell | Rolled/faceted aluminium-lithium case with visible wall thickness at the docking cut; dielectric pressure coating. |
| Docking ring | Machined steel, keyed petals, not a painted circle. |
| Aft thruster / lamp | Recessed ceramic-lined well with a small lamp at the throat. Not a glow card, not exhaust. |

Forbidden reads: rover safety-yellow (`#ffd23f`), generic UV grid, plastic toy, flat windows, bolt
spray, emissive outline, billboard exhaust, micro-label dependence, glued cube pile, vending machine,
toy rocket, shrine, glowing hatch.

---

## Silhouette from directly above (the only view that matters)

Four masses a person resolves at ~120 px across the cell. If the outline is a dark square with a
circle in it and five brown pixels beside, the asset has failed.

1. **Dark octagonal collar** — a flange around a real hole, not a painted ring. Inner well is a
   cavity with liner walls and four guide rails.
2. **Freight apron** — a loading deck on +X, crates accumulating as five distinct modules whose
   *footprint* grows first (law of the stand-in: a pile that only grows in Z reads as one crate).
3. **Cradle hardware** — formed clamps and a load beam breaking the well’s perfect symmetry.
4. **Pod docking face** — keyed ring and petals, not a cone and not a featureless disc. Guide shoes
   at four stations. Aft thruster is *not* the top face; it lives in the well and reads at `works_edge`.

At the site register (19 px/cell) those three families — dark port, mid-value crates, cooler pod —
must separate without labels or glow.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **≤ 1.00 × 1.00 cell footprint**, pod **≤ 0.60 cell** in any axis.
Origin at cell centre. +X starboard (apron), +Y along the board, +Z up / launch. Feet on z = 0.

| Part | wu | cells |
|---|---|---|
| Port envelope L × W | ≤ 2.20 × 2.20 | ≤ 1.00 × 1.00 |
| Collar well centre | (−0.28, 0.00) | |
| Well inner (vertex radius) | 0.40 | 0.18 |
| Collar outer (vertex radius) | 0.56 | 0.25 |
| Collar flange top | z = 0.42 | 0.19 |
| Apron deck | x 0.38–1.05, z = 0.08 | |
| Pod barrel radius | 0.26 max | 0.12 |
| Pod seated height (aft→ring) | ~0.96 | 0.44 |
| Pod envelope | ≤ 1.32 any axis | ≤ 0.60 |

Hooks (exact names): `crate_0`, `crate_1`, `crate_2`, `crate_3`, `crate_4`, `cradle`, `pod_root`,
`pod_thruster`. Root node: `SF_WORKS_CARGO_PORT_V1`. LOD roots: `LOD0_cargo_port`, `LOD1_cargo_port`,
`LOD2_cargo_port`.

Crate stages are **additive and disjoint**: `crate_i.visible = stage > i`. Each crate is a unique
module at a unique XY (footprint-first). Toggling any subset must not z-fight. `pod_root` owns the
complete detachable pod; `pod_thruster` is parented beneath it.

---

## Component reference decision

`componentReferenceDecision`: `native_imagegen`.

Generated construction studies (component-only; not identity; not projected as textures):

| File | SHA-256 | Selected | Rejected |
|---|---|---|---|
| `ref_01_shaft_collar.jpg` | `67344F641C1E704549110EA624B69877FC781AB73CC864B73EDABE5DFCED7174` | Octagonal plate flange around a dark well; inner guide rails; overlapping corner gussets; side hatch as a real plate, not a glow. | Concrete bunker identity; rust as the only material; any implied full-scale mine headframe. |
| `ref_02_launch_cradle.jpg` | `17FEF1588BEFBA68121AC34D0418057D3C0AEF4D8C3EBD3612DB957063C2D9F9` | Formed saddle with bright machined contact; clamp jaws; load path into a beam; grease and abrasion. | Sneaker-scale gag; micro-stamped labels as the read; copying the exact clamp count. |
| `ref_03_cargo_modules.jpg` | `995864893A2035C6BAC71B8B33483F044E306EC70845337940EF688348136684` | Five *different* cases: lidded trunk, strapped cube, long instrument, open-frame, stacked pair; olive/khaki/slate; corner irons; recessed handles; skid feet. | Readable “FRAGILE” type; open empty box as a runtime stage (we ship closed freight); yellow deck tape. |
| `ref_04_courier_capsule.jpg` | `5E0BC217E1144D50EE80011F981ABA7CD86A9BD639EE1C68D059C85EF1D7993C` | Standing pressure vessel in a well; docking ring on the space face; guide shoes; seated in a collar. | Yellow hazard tape on fins; side “eye” viewport as a thruster; toy-rocket ogive; micro-labels. Thruster is a recessed aft well, not the side lamp. |

Frozen identity is the law silhouette, the numbers above, and the hook names — not the generated pixels.

---

## Material bill (preflight)

Working scene: `tools/blender/build_works_cargo_port.py` →
`assets/works/cargo_port/source/cargo_port_lod{0,1,2}.glb` and
`assets/ships/parts/works/place_works_cargo_port.glb`.
G0–G7: cycle 01 is `evidence_ready` only. G1/G2/G4 whole-asset remain open.
`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.

| Zone | Disp. | Base | Rough | Metal | Wear / why | Works light |
|---|---|---|---|---|---|---|
| Port structure (collar, liner, feet, apron, rails) | billed | `#2a2622` dark oxide steel | 0.55–0.72 | 0.55–0.80 | Dirt in seams; flange edges brighter. | Darkest mass; key finds flange bevels and the well as a hole. |
| Cradle interfaces | billed | `#6a6258` worn machined steel | 0.28–0.45 | 0.72–0.90 | Burnished contact, grease. | Brightest metal on the machine; must not be yellow. |
| Crate family | billed | olive `#5c5344` / khaki `#6b5a48` / slate `#4a5548` / tan `#6a5e4c` dielectric | 0.48–0.70 | 0.04–0.18 (paint); irons 0.6 | Chips at corners; straps darker. | Mid-value freight cluster, separate from the collar. |
| Pod pressure skin | billed | `#8e979c` cool coating over metal | 0.32–0.50 | 0.12–0.28 | Aft heat-stain toward the well. | Cooler than crates; docking ring machined. |
| Thruster / lamp | billed | sooted ceramic `#2a241c`; lamp `#e8d4a8` | 0.55–0.80 throat; 0.20 lamp | 0.05–0.20 | Recessed; still a fixture with emissive off. | Legal emissive only here, inside the well. |

World: dark. Key `0xffdcbc` raking, real shadows. Rim cool, fill weak. ≈5:1 key:fill. No rover yellow
on any zone.

Shape-grammar failure of the stand-in: **torus + capsule + cube pile**. Replacement sequence:
folded octagonal collar with a constructed well, formed cradle saddle, five unique crate modules,
pressure-vessel capsule with docking cut and recessed aft throat. Clay must read the four planform
masses without textures.

---

## Quality axes (grade these, not taste)

1. **Planform at 120 px/cell** — collar+well, apron freight, cradle, pod docking face.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Site register** — port / accumulated cargo / pod separate without labels or glow.
4. **Manufacture** — plate flanges, well liner, saddle, crate irons/handles/feet, pod wall thickness.
5. **Launch axis** — seated vs launch-clear stills prove +Z climb through the well.
6. **Crate stages** — five additive unique modules, no z-fight, footprint grows.
7. **Hooks / envelope / LOD** — exact names; footprint ≤1 cell; pod ≤0.6 cell; LOD1 is a real reduction.

Cycle 01 weakest expected: pod docking face density vs the collar, and crate family variation at
19 px/cell — both are later-cycle material, not a reason to glue cubes now.

---

## Cycle 02 correction (this candidate)

Cycle 01 stills read as a shrine: concentric octagon around a pale circular docking well, four
equal cube jack pads, and a 2×2 cabinet of recolored cubes. Cycle 02 keeps the same hooks,
envelope, launch axis, and budgets, and freezes `evidence/cycle_001`.

| Defect | Cycle 02 construction |
|---|---|
| Concentric torus collar | Folded octagonal flange with unequal outer radii, overlapping plates, +X loading throat, closed liner |
| Symmetric dual saddles | One C-clamp cradle open toward the throat, load beam to the apron, visible jaws |
| Equal cube pucks | Three folded hat-section jack pads of different size/rotation; C-channel guides |
| 2×2 cube freight | Trunk → cube → instrument → open frame → vented module; unique XY footprints |
| Pale circular badge | Faceted pressure shell offset into the clamp; rectangular keyed docking plate |
| Site families merge | LOD1/LOD2 keep dark port, mid freight, cooler pod at 19 px/cell; no labels/glow |

Working scene is still `tools/blender/build_works_cargo_port.py`. Cycle 02 evidence lives in
`evidence/cycle_002/`. G1/G2/G4 remain open.

---

## Cycle 03 correction (this candidate)

Independent review of Cycle 02: REVISE, source-only. The docking face was a bright plate
stacked on a filled/capped oval. The cradle read as boxes attached to a capped loft.

Cycle 03 keeps the same hooks, envelope, launch axis, five crate footprints, horseshoe
flange, +X throat, and freezes `evidence/cycle_001` plus `evidence/cycle_002`.

| Defect | Cycle 03 construction |
|---|---|
| Capped docking plug / bright plate | Keyed well cut through the pod cap: rim with wall thickness, inward walls, dark floor. Opening remains a hole in clay, material, and LOD stills. |
| Box cradle on a loft | One manufactured open C-clamp whose arms continue onto the +X apron lip. Not a C-channel bar glued to a saddle. |
| Hottest value on the docking plate | Docking rim is machined but darker than Cycle 02; well interior samples dark port oxide so the hole is the primary depth cue. Emission stays off except the recessed aft lamp. |

Cycle 03 evidence lives in `evidence/cycle_003/`. G1/G2/G4 remain open. This is an
implementing decision, not controller acceptance.
