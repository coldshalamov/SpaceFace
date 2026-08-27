# Works refinery — Cycle 02 material and shape audit

**Asset:** `place_works_refinery`. **State:** `design_candidate`. **Disposition:** `review_pending`.
Independent G1/G2/G4 not launched. Technical receipt only.

Candidate: `assets/ships/parts/works/place_works_refinery.glb`
SHA256: `7984CD679A1FC5A6259EA2BD232A8CB58834D214935D100D263E6A1222827733`

Supported views: `works_top` / `works_edge` / `works_site` at 1920×1080, 31° persp, 120 / 120 / 19 px/cell.

---

## Shape grammar (clay `works_top_clay`)

From straight above the clay is a **process train**, not one occupancy pad:

| Mass | Clay read | Primitive origin | Kept because |
|---|---|---|---|
| Furnace jacket | Rectangular insulated casing with modest corners, inset course bands, thick crown around a framed well | Rounded-rect loft with corner ~0.07, not 0.20 | Cycle 01 lozenge was the 0.20 corner; this is a roast box |
| Charging well | Blind recessed cavity: steel lip with thickness, soot walls tapering to a small floor | Jacket shell + refractory liner + small ember | Dark hole, never an orange window. `furnace_slit` owns the floor lens |
| Burner plenum | Offset service pack on the −Y face with nozzles, flange, lid | Stepped loft | Fuel/air manifold; LOD0/1 |
| Flue + stack | Rect takeoff, rect-to-round, mitered elbow, neck/hoops, cap smaller than OD | Discrete manufactured pieces | Exhaust path; `stack_vent` is the outlet under the cap |
| Pipe | Plan-visible run with miters into a tank nozzle | Chamfered polyline, small cut | Process transfer; does not fill the gallery |
| Tank | Horizontal vessel on two saddles/base plates, knuckle ends, manway | Circular loft along Y, flattened heads | Hold tank; open channel vs furnace |
| Feet | Four tapered pads on z = 0 with a gap under the jacket | Truncated lofts + gussets (LOD0/1) | Bearing on the gallery floor |
| Lamp | Hood/socket/recessed lens at the flue neck | Spun dish + lens | One work-light, never a halo |

**Unresolved blockout risk:** the furnace plan is still a **formed rectangle**. Inset courses and the framed well keep it from being a cube-with-a-line or a lozenge, but it is not a spun kettle or brick arch. Recorded as Cycle 02 remaining risk, not a pass.

Negative space: gallery floor shows between furnace↔stack (except the flue neck) and furnace↔tank (except the pipe). Footprint 1.74 × 1.52 wu inside the 2.2 cell. Underside z = 0.

---

## Material bill vs stills

| Zone | Bill | Beauty still | Verdict |
|---|---|---|---|
| Jacket / feet / straps | Dark cool dielectric paint | Dark graphite body, cooler than stack/tank | Holds |
| Well / ceramic | Dry soot-dark refractory, non-emissive | Near-black walls inside the lip | Holds — no tan orange stripe |
| Ember lens | Dark ceramic-glass, emission 0 on beauty | Dark floor; `state_emission` shows recessed glow only | Inactive. Diagnostic is a hole glow, not a crown window |
| Lip | Heat-stained steel frame | Bronze rectangle around the hole | Holds |
| Burner / flue | Heat-stained bare metal | Straw/brown metal on the takeoff and elbow | Holds |
| Stack / cap | Oxidized scale metal | Rust disk, distinct from jacket, cap smaller | Holds as a flue; still a disk from above |
| Tank | Matte oxide-red dielectric paint | Darker red vessel after the peach correction | Holds; saddles read as pads |
| Pipe | Heat-stained metal | Visible mitered run, not a smudge | Holds |
| Lamp | Hood + recessed lens | Small fixture at the flue neck | Holds |

No safety yellow. No neon outline. No leather. ORM isolation: furnace green (rough dielectric), stack/pipe magenta (metal), tank lime (very rough dielectric). Unique UV0; overlap loops = 0 on bake.

---

## Camera / pixel facts (Cycle 02)

| Still | px/cell | Object bbox (full 1920×1080) | 1:1 crop |
|---|---|---|---|
| works_top | 120.0 | 132 × 132 px | `works_top_1to1.png` |
| works_edge | 120.0 | object offset with pad | `works_edge_1to1.png` |
| works_site | 19.0 | 22 × 22 px | `works_site_1to1.png` |

FOV 31° vertical. Distance works_top D ≈ 35.70 wu. Beauty slit inactive; `state_emission.png` is the 1.0 diagnostic.

Site 22 px: cooler dark furnace mass, offset rust stack disk, distinct darker-red tank oval, connected by a few neck/pipe pixels. No glow, outline, or label.

---

## LOD

| LOD | Tris | Budget | Draws | Keeps |
|---|---|---|---|---|
| 0 | 5488 | 8000 | 3 | Full train, inset courses, clamps, door, burners, hollow stack, baffles, lip, well liner |
| 1 | 1564 | 2000 | 3 | Furnace/slit, stack path, tank, pipe, saddles, hooks, lip |
| 2 | 540 | 600 | 3 | Same masses; jacket taper is the well; stack is a solid taper; outlet still the hook |

Hidden-face dry-run is per LOD (`works_visible_faces.json`). Coarse 80×45 grid reports the slit/lamp meshes as 0 visible — that is grid miss, not proof the well is sealed. Do not `--delete`.

---

## Remaining visual risk (honest)

- Furnace is a formed rectangle at play size; a reviewer can still ask for a kettle/arch section.
- Stack from the top camera is a rust disk with a smaller cap and a rect neck; it will never look like a side-elevation flue.
- Site 22 px pairing is three values but fragile.
- Edge camera is still nearly straight down (law); side wall read is modest.
- LOD2 drops the separate lip, burner pack, and rect takeoff mesh.
- G1/G2/G4 whole-asset open until independent review of this hash.
