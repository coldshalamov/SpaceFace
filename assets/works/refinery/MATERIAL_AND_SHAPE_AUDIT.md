# Works refinery — Cycle 03 material and shape audit

**Asset:** `place_works_refinery`. **State:** `design_candidate`. **Disposition:** `review_pending`.
Independent G1/G2/G4 not launched. Technical receipt only.

Recovery inspection at the supported 120 px and 19 px works cameras: **KEEP for the Cycle 03
correction scope**. This does not close independent whole-asset G7.

Candidate: `assets/ships/parts/works/place_works_refinery.glb`
SHA256: `1D0F648E023AED996A76BE91255C869CBAF1554F3D25DE9EAD701F1BC62022C0`

Supported views: `works_top` / `works_edge` / `works_site` at 1920×1080, 31° persp, 120 / 120 / 19 px/cell.

---

## Shape grammar (clay `works_top_clay`)

From straight above the clay is a **process train**, not one occupancy pad:

| Mass | Clay read | Primitive origin | Kept because |
|---|---|---|---|
| Furnace jacket | Chamfered insulated casing with a flared skirt, deep waist, broad returned shoulder course, narrow crown, and proud folded corner returns | 8-sided formed jacket sections, not a rounded-rect loft | Cycle 02 rounded box was the defect |
| Charging well | Blind recessed cavity: thin dark lip, charcoal walls, smaller floor | Jacket inner taper + refractory liner + small ember | Walls and floor separate at 120 px. `furnace_slit` owns the floor lens |
| Burner plenum | Offset service pack on the −Y face with nozzles, flange, lid | Stepped loft | Fuel/air manifold; LOD0/1 |
| Flue + stack | Rect takeoff, banded rect-to-round, flange/union, mitered elbow, neck/hoops, cap smaller than OD | Discrete manufactured pieces | Exhaust path; `stack_vent` is the outlet under the cap |
| Pipe | Plan-visible run with miters into a tank nozzle | Chamfered polyline, small cut | Process transfer; does not fill the gallery |
| Tank | Horizontal vessel on two wrapped saddles/pads, knuckle ends, manway | Circular loft along Y | Hold tank; open channel vs furnace |
| Feet | Four tapered pads on z = 0 with a gap under the jacket | Truncated lofts + gussets (LOD0/1) | Bearing on the gallery floor |
| Lamp | Hood/socket/recessed lens at the flue neck | Spun dish + lens | One work-light, never a halo |

The furnace remains intentionally rectilinear process equipment, but the supported clay frame now
shows its stepped jacket and structural returns rather than a rounded-box blockout.

Negative space: gallery floor shows between furnace↔stack (except the flue neck) and furnace↔tank (except the pipe). Footprint 1.72 × 1.55 wu inside the 2.2 cell. Underside z = 0.

---

## Material bill vs stills

| Zone | Bill | Beauty still | Verdict |
|---|---|---|---|
| Jacket / feet / straps | Dark cool dielectric paint, AO-segmented courses | Readable cool graphite body, cooler than stack/tank; waist and returned shoulder remain separated | Holds |
| Well / ceramic | Dry charcoal refractory, non-emissive | Charcoal wall band around a darker floor | Holds — no tan orange stripe, no copper frame |
| Ember lens | Dark ceramic-glass, emission 0 on beauty | Dark floor; `state_emission` shows recessed glow only | Inactive. Diagnostic is a hole glow, not a crown window |
| Lip | Thin dark steel | Narrow dark rim, not a bronze picture-frame | Holds |
| Burner / flue | Heat-stained bare steel | Gray-brown metal on takeoff, union, elbow | Holds; not a copper bar |
| Stack / cap | Oxidized scale metal | Rust disk, distinct from jacket, cap smaller | Holds as a flue; still a disk from above |
| Tank | Matte oxide-red dielectric paint | Darker red vessel on wrapped saddles | Holds |
| Pipe | Heat-stained metal | Visible mitered run into a nozzle | Holds |
| Lamp | Hood + recessed lens | Small fixture at the flue neck | Holds |

No safety yellow. No neon outline. No leather. ORM isolation: furnace green (rough dielectric), stack/pipe magenta (metal), tank lime (very rough dielectric). Unique UV0; overlap loops = 0 on bake.

---

## Camera / pixel facts (Cycle 03)

| Still | px/cell | Object bbox (full 1920×1080) | 1:1 crop |
|---|---|---|---|
| works_top | 120.0 | 132 × 132 px | `works_top_1to1.png` |
| works_edge | 120.0 | object offset with pad | `works_edge_1to1.png` |
| works_site | 19.0 | 22 × 22 px | `works_site_1to1.png` |

FOV 31° vertical. Distance works_top D ≈ 35.70 wu. Beauty slit inactive; `state_emission.png` is the 1.0 diagnostic.

Site 22 px: cooler dark furnace mass, offset rust stack disk, distinct darker-red tank oval, connected by a few neck/pipe pixels, with an empty gallery slit. No glow, outline, or label.

---

## LOD

| LOD | Tris | Budget | Draws | Keeps |
|---|---|---|---|---|
| 0 | 7442 | 8000 | 3 | Full train, waist/courses, corner returns, clamps, door, burners, hollow stack, baffles, lip, well liner |
| 1 | 1840 | 2000 | 3 | Furnace/slit, stack path, tank wraps, pipe, saddles, hooks, lip |
| 2 | 560 | 600 | 3 | Same masses; jacket taper is the well; stack is elbow + solid taper; outlet still the hook |

Hidden-face dry-run is per LOD (`works_visible_faces.json`). Coarse 80×45 grid reports the slit/lamp meshes as 0 visible — that is grid miss, not proof the well is sealed. Do not `--delete`.

---

## Remaining visual risk (honest)

- Stack from the top camera is a rust disk with a smaller cap and a rooted elbow; it will never look like a side-elevation flue.
- Site 22 px pairing preserves three values and a gallery slit, but construction detail necessarily reduces to silhouette and value.
- Edge camera is still nearly straight down by law; feet, gussets, and side-course depth remain modest.
- LOD2 drops the separate lip, burner pack, well liner, wrapped straps, and rect takeoff mesh.
- G1/G2/G4 whole-asset open until independent review of this hash.
