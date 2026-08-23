# Works rover — cycle 1 reference brief

**Asset:** `rover` (PQ-131.01). **Class:** place/prop, works camera only. **Tier:** B (hero of the mine).
**State:** `design_candidate`. Cycle 1 of ≥5. This page is the contract for cycles 2–5.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same, object at frame edge), `works_site`
(19 px/cell). All 1920×1080, 31° perspective, +Z up, origin at cell centre, tracks’ underside at z = 0.
Never orthographic. No fog. No studio three-quarter.

Stand-in for scale: `.devshots/asteroid-works/01-cutaway-fresh.png`. The rover is the only safety-yellow
object, sitting in the bored cell immediately under the surface port (centre column of the work view,
first gallery row). At 120 px/cell it occupies ~102 × 96 px. That is the size this asset must read at.

---

## Fiction (ART EXTRAPOLATION unless noted)

A **crewed, one-operator gallery crawler** — field equipment that works a bored cell inside an asteroid,
not a spaceship. Law §4: the only safety-yellow object in the world. Sold as a Helix/MTS pattern
crawler to independent claim crews (canon: Helix Directorate + MTS ore trade; this specific pattern is
extrapolated). It is bolted, plated, bolted again, scratched, and repaired in the shaft.

| Assembly | Manufacture |
|---|---|
| Chassis / deck / cab / hopper walls / boom arm | Folded 3–4 mm steel plate, welded seams, then hex-bolted overlapping courses. Safety-yellow alkyd over zinc primer. |
| Undercarriage, pivot, vent, lamp cans | Cast / machined steel, dark oxide, grease. |
| Tracks | Extruded rubber-composite pads on a forged chain; we ship the outer belt as one UV-scroll mesh per side. |
| Cab pane | Laminated glass in a welded frame; dark, not glowing. |
| Hopper liner | Bare AR-plate, unpainted. Mouth edges worn to bright metal. |
| Bit | Forged tool steel, carbide inserts, heat-tinted. |
| Chevrons | Separate `#161008` plates, bolted on. Not painted stripes. |
| Scar plate | Replaceable flank plate; gas-breach chip lives here. |
| Fasteners | Hex heads, modelled at interfaces that read at 120 px (~0.03–0.04 wu), not texture studs. |

Crewed (cab is a real cabin with a roof pane). Remote-capable; the operator is optional to the silhouette.

---

## Silhouette from directly above (the only view that matters)

Five shapes a person resolves at 102 × 96 px. If the outline is a rounded rectangle with detail painted
on it, the asset has failed.

1. **Two dark stadiums** — track units, longest and darkest, flanking left/right. Continuous tread, not wheels.
2. **Aft dark well** — open hopper mouth, a rectangular hole, not a yellow lid.
3. **Raised cab** — shorter, taller mass with a **dark roof pane**; not a yellow slab.
4. **Offset boom** — tapered finger on the starboard side, pointing +X (facing). Breaks left/right symmetry.
5. **Steel bit** — small disc/cone at the boom tip; the facing cue.

Yellow is the deck + cab sides + hopper outer walls + boom. It is **not** the tracks, well, glass, bit,
chevrons, or undercarriage. A rover that is 90% yellow reads as a toy.

---

## Proportions (committed)

1 cell = 2.2 wu. Inventory: **0.85 × 0.8 cell, ≈0.45 tall** → **1.87 × 1.76 × 0.99 wu**.
Origin at cell centre. +X forward (bit), +Y port/starboard, +Z up. Base on the cut face (z = 0).

| Part | wu | cells |
|---|---|---|
| Envelope L × W × H | 1.87 × 1.76 × 0.99 | 0.85 × 0.80 × 0.45 |
| Tracks (each), length along X | 1.42 (straight 1.10 + two 0.16 ends) | 0.65 |
| Track width / height | 0.24 / 0.32 | 0.11 / 0.15 |
| Track centres Y | ±0.76 | ±0.35 |
| Cab footprint (roof) | 0.52 × 0.70 | 0.24 × 0.32 |
| Hopper opening (mouth) | 0.56 × 0.50 | 0.25 × 0.23 |
| Boom reach at rest (pivot → bit tip) | 0.63 | 0.29 |
| Boom reach extended | 0.85 | 0.39 |
| Bit tip at rest (world X) | +0.97 | — |
| Aft hopper bumper (world X) | −0.90 | — |

Rest pose must sit inside the envelope ±5%. Extended boom is runtime, not the exported bbox.

Hooks (exact names): `boom_pivot`, `bit_tip`, `hopper_fill_0`…`4`, `hopper_lid`, `lamp_socket`,
`vent_stack`, `track_L`, `track_R`, `scar_plate`. Root node: `rover`. LOD meshes: `LOD{n}_Merged_Material_*`.

---

## Material bill (preflight)

`componentReferenceDecision`: `native_imagegen`. Refs: `ref_01_overhead_crawler.png` (planform: stadiums,
well, offset boom — selected), `ref_02_dusk_livery.png` (yellow as paint, chevrons as plates, dusk key —
selected; reject whole-vehicle identity), `ref_03_boom_bit.png` (forged bit, box boom, hydraulics —
selected). Frozen identity is the law silhouette and the numbers above, not the generated pixels.

| Zone | Disp. | Base | Rough | Metal | Wear / why | Dusk light |
|---|---|---|---|---|---|---|
| Livery plate (deck, cab sides, hopper outer, boom) | billed | `#ffd23f` dielectric | 0.42–0.62 | 0.08–0.16 | Chips to primer/steel on leading edges, hopper lip, boom corners. Dirt in seams. | Warm key rakes bevels; yellow stays a paint, not a light. |
| Chevron plates | billed | `#161008` | 0.60–0.72 | 0.10–0.18 | Dust in bolts; not glossy. | Read as dark bars on the deck from above. |
| Undercarriage / pivot / vent | billed | `#2a2722` steel | 0.28–0.45 | 0.72–0.88 | Grease, oxide. | Mostly in key shadow; rim catches top edges. |
| Track belt | billed | `#3a3530` rubber | 0.78–0.90 | 0.04–0.12 | Outer faces abraded against rock; packed fines in grooves. | Darkest mass; key finds the stadium crown. |
| Cab glass | billed | `#161009` | 0.08–0.18 | 0.02–0.06 | Dust film. **Not emissive.** | A dark rectangle in the cab roof. |
| Bit | billed | `#848b93` → heat `#9a6f4a`–`#ff6242` | 0.35–0.55 | 0.70–0.88 | Rock polish + heat tint toward tip. | Only emissive with the lamp. |
| Lamp glass | billed | warm dielectric | 0.20–0.32 | 0.04 | Recessed in a hood. | The other legal emissive. |
| Hopper liner / fill | billed | AR steel / rubble | 0.70–0.95 | 0.05–0.40 | Mouth burnished. Fills 0–4 nested. | Well is a hole the key cannot fill. |
| Scar plate | billed | sooted steel | 0.55–0.70 | 0.50–0.70 | Gas-breach chip. | Flank, readable at works_edge. |

Yellow **does not** go on tracks, well interior, glass, bit, chevrons, scar, vent, lamp can, or
undercarriage.

World: dark. Key `0xffdcbc` from below-left, shallow to the pad, real shadows. Rim `0x9db8f0` weak from
above. Fill `0xd8c3a8` weak, opposite quadrant. ≈5:1 key:fill on the pad. Surfaces are designed for
that raking amber, not a studio HDRI: bevels must exist, cavities must be real, paint must be
dielectric or it dies in the bore.

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
Working scene: `tools/blender/build_works_rover_mtx.py` → `assets/works/rover/source/rover_lod{0,1,2}.glb`.
G0–G7: cycle 1 is `evidence_ready` only. G1/G2/G4 whole-asset remain open.

Shape-grammar failure of the stand-in: **glued boxes** (`makeRover`). Replacement sequence: lofted
plate chassis with real well/window cuts, overlapping folded courses, stadium track shells, tapered
boom loft, named hooks. Clay must read those five planform shapes without textures.

---

## Quality axes (grade these, not taste)

1. **Planform at 120 px/cell** — five shapes, not a rounded yellow rectangle.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Yellow discipline** — connected livery, minority of pixels; tracks/well/glass/bit stay not-yellow.
4. **Manufacture** — plate courses, cuts, fasteners, stadium belts; no primitive stack.
5. **Works light** — raking amber finds bevels and throws pad shadows; no emissive paint.
6. **Hooks / envelope / LOD** — 13/13 names; bbox ±5%; LOD1 is a real reduction, not a copy.
7. **Facing** — boom + bit readable from above as the direction of travel.

Cycle 1 weakest expected: boom/bit density vs the cab/hopper, and track tread as a ribbon rather than
a plate chain — both are cycle-2 material, not a reason to glue boxes now.

---

## Cycle 2 changes

Contract numbers above are unchanged. Cycle 2 hit them; it did not rewrite them.

- **Atlas.** One 4×4 atlas per LOD (2048² / 1024² / 512²), three maps, nine roles in hard-coded tiles 0–8, reserved 9–15 filled with neighbour neutrals, 4-texel gutter at 2048 with edge-clamp. One material per LOD. Eighty-one cycle-1 PNGs deleted.
- **Body.** Deck / hopper outer / cab half-width ≤ 0.60 so the tracks (centres Y ±0.76, width 0.24) own the outline. Chevron courses cantilever 0.04 wu, nowhere else.
- **Well.** Open 0.56 × 0.50 mouth, centre aft of X = −0.35, AR-plate liner sinking 0.26 wu. `hopper_fill_0..4` sit inside. Lid parked as an aft tailgate so it does not roof the hole.
- **Cab pane.** Raised cab 0.52 × 0.70; a through-cut onto a recessed `#161009` pane, not a yellow shelf.
- **Boom / bit.** Boxed weldment on the starboard deck, pivot Y ≈ −0.36, rest tip at world X ≈ +0.97, taper 0.16 → 0.07. Forged bit ≥ 0.11 across with carbide facets. Not a centreline cylinder.
- **Chevrons.** Four separate `#161008` plates, each ≥ 0.30 × 0.09, 0.012 proud, bolts at the ends.

Envelope 1.87 × 1.76 × 0.99, origin, and the 13 hook names are unchanged. G1/G2/G4 whole-asset stay open pending independent review of `evidence/cycle_002/` at 1:1.

---

## Cycle 3 changes

Contract numbers above are unchanged. Cycle 2 satisfied the occupancy rows and still read as a stamped bracket; cycle 3 restores mass without rewriting the envelope, hooks, or the `#ffd23f` / `#848b93` / `#161008` bill.

- **Gate.** Object silhouette is taken from a pad-excluded ID pass (~106×98 px at `works_top`, not the 130×130 pad). Contrast, saturation and luminance rows read the beauty frame inside that mask. Depth is a linear camera-distance pass. New floors: `HAS_MASS` ≥ 0.72 wu, `WELL_IS_A_HOLE` ≥ 0.24 wu below deck, `CAB_IS_RAISED` ≥ 0.28 wu above, opposite signs, `ONE_BODY` ≥ 0.90, `TREAD_PADS` ≥ 14/side, `TRACK_ENDS_ROUND` ≥ 0.06/side, `NORMAL_RELIEF` ≥ 0.040, `TRACK_CONTRAST` ≥ 18 levels/side, `LIVERY_SAT_RENDERED` ≥ 30% of livery pixels at S ≥ 0.70, `EDGE_SHOWS_WALL` ≥ 1.10.
- **Mass.** Deck at z 0.32–0.46 with side walls to the undercarriage. Cab house roof at z ≈ 0.96 (≥ 0.34 wu proud of the deck), pane recessed ~0.06 wu into that roof. Hopper floor ≥ 0.28 wu below the deck, four interior walls, not a painted square.
- **One body.** Continuous deck plate. Chevrons moved outboard onto the deck edges as four transverse bars ≥ 0.30 × 0.09. No centreline channel.
- **Tracks.** XY stadiums (end radius 0.12 wu) with ≥ 16 modelled pads per side, idlers/bogies into the hull. Outer edge Y ±0.88; longest body shapes.
- **Boom / bit.** Pivot yoke at Y ≈ −0.34, boxed weldment with steel webs and a yellow top plate, faceted steel head ≥ 0.11 across, heat tint only toward the tip. Not a salmon sphere.
- **Manufacture.** Overlapping plate courses, hex heads 0.03–0.04 wu at interfaces, atlas normals with plate/bolt relief (`stdev` floor 0.040). Atlas tile map unchanged.

Envelope 1.87 × 1.76 × 0.99, origin, and the 13 hook names remain the cycle-1 contract. G1/G2/G4 whole-asset stay open pending independent review of `evidence/cycle_003/` at 1:1.

