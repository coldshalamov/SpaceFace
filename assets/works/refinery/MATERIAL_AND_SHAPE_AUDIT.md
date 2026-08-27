# Works refinery — Cycle 01 material and shape audit

**Asset:** `place_works_refinery`. **State:** `design_candidate`. **Disposition:** `review_pending`.
Independent G1/G2/G4 not launched. Technical receipt only.

Candidate: `assets/ships/parts/works/place_works_refinery.glb`
SHA256: `80CF0DE0F97C1D7722DFB4A9B977B1E046D28F180701B32BF3CA52C3D62D9216`

Supported views: `works_top` / `works_edge` / `works_site` at 1920×1080, 31° persp, 120 / 120 / 19 px/cell.

---

## Shape grammar (clay `works_top_clay`)

From straight above the clay is a **process train**, not one occupancy pad:

| Mass | Clay read | Primitive origin | Kept because |
|---|---|---|---|
| Furnace jacket | Formed rounded casing with a stepped shoulder into an inset crown; dark slot is a hole with a lip | Rounded-rect loft stations, not a cube | Insulated roast box; waist/crown are manufacturing courses |
| Slit / well | Recessed rectangular cavity, inner walls, floor lens | Boolean-free shell (outer/inner rings) | Charging / sight throat; emission lives only on the floor lens |
| Burner plenum | Offset service pack on the −Y face | Stepped loft | Fuel/air manifold; breaks left/right symmetry |
| Flue + stack | Offset disk, rooted by a short takeoff, cap above an open outlet | Rect-to-round collar + tapered tube | Exhaust path; `stack_vent` is the outlet under the cap |
| Pipe | Plan-visible run with elbows into the tank | Chamfered polyline loft, not a torus | Process transfer; flanges/clamp at LOD0/1 |
| Tank | Horizontal vessel on two saddles, dished heads, manway | Circular loft along Y | Hold tank; open channel vs furnace |
| Feet | Four tapered pads on z = 0 | Truncated lofts + two gussets (LOD0) | Bearing on the gallery floor |
| Lamp | Small hood/socket near the flue | Spun dish + lens | One work-light, never a halo |

**Unresolved blockout risk:** the furnace plan is still a **formed rounded rectangle**. Shoulder/inset/slit keep it from being a cube-with-a-line, but it is not yet a spun kettle or brick arch. Recorded as Cycle 01 remaining risk, not a pass.

Negative space: gallery floor shows between furnace↔stack (except the flue neck) and furnace↔tank (except the pipe). Footprint 1.64 × 1.35 wu inside the 2.2 cell. Underside z = 0.

---

## Material bill vs stills

| Zone | Bill | Beauty still | Verdict |
|---|---|---|---|
| Jacket / feet / straps | Dark cool dielectric paint | Dark graphite body | Holds; some plates still close in value |
| Well / ceramic | Dry tan refractory, non-emissive | Warm brown walls inside the slot | Partial — reads warm under the key; not chrome |
| Ember lens | Dark ceramic-glass, emission 0 on beauty | Slot median luma ~0.11 vs body ~0.09, RGB ~0.20/0.09/0.05 | Inactive. Thumbnail can still misread the warm slot as a glow |
| Burner / flue | Heat-stained bare metal | Straw/brown metal on the takeoff | Holds |
| Stack / cap | Oxidized scale metal | Rust disk, distinct from jacket | Holds |
| Tank | Oxide-red dielectric paint | Rust vessel, not rover yellow | Holds |
| Pipe | Heat-stained metal | Visible run, darker than tank | Holds |
| Lamp | Hood + warm lens | Small fixture at the flue | Holds; easy to miss at 120 px |

No safety yellow. No neon outline. No leather. ORM isolation shows roughness/metal variation (green/magenta), not a flat fill. Unique UV0 islands in `uv0_layout.png` / ID map; overlap loops = 0 on bake.

---

## Camera / pixel facts (Cycle 01)

| Still | px/cell | Object bbox (full 1920×1080) | 1:1 crop |
|---|---|---|---|
| works_top | 120.0 | 132 × 132 px | `works_top_1to1.png` |
| works_edge | 120.0 | object offset with pad | `works_edge_1to1.png` |
| works_site | 19.0 | 22 × 22 px | `works_site_1to1.png` |

FOV 31° vertical. Distance works_top D ≈ 35.70 wu. Beauty slit inactive; `state_emission.png` is the 1.0 diagnostic.

---

## LOD

| LOD | Tris | Budget | Draws | Keeps |
|---|---|---|---|---|
| 0 | 4900 | 8000 | 3 | Full train, straps, door, three burners, hollow stack, baffles |
| 1 | 1304 | 2000 | 3 | Furnace/slit, stack, tank, pipe, hooks |
| 2 | 536 | 600 | 3 | Same masses; stack is a solid taper (outlet still the hook) |

Hidden-face dry-run is per LOD (`works_visible_faces.json`). Coarse 80×45 grid reports the slit/lamp meshes as 0 visible — that is grid miss, not proof the well is sealed. Do not `--delete`.

---

## Remaining visual risk (honest)

- Furnace still a rounded-rect casing at play size; a reviewer can ask for a more kettle/arch section.
- Warm slot vs dark jacket can thumbnail as a glowing stripe even with emission 0.
- Site 22 px is a dark lump + rust accent; furnace/stack pairing is fragile at 19 px/cell.
- Edge camera is still nearly straight down (law); side wall read is modest.
- Mesh-derived normals are quiet on the crown from the top camera.
- LOD2 stack is solid, not a hollow flue.
- G1/G2/G4 whole-asset open until independent review of this hash.
