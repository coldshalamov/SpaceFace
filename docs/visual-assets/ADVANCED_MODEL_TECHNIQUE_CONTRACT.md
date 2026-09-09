<!-- LIFETIME: STABLE -->
# Advanced model technique contract

This is the exhaustive, fail-closed list of **Blender / game-lab model techniques** SpaceFace
requires on camera-visible 3D. It exists so a later agent cannot satisfy a remaster by renaming
boxes, tinting one texture, raising a triangle count, or writing “manufactured.”

It does not replace `VISUAL_ASSET_PRODUCTION_STANDARD.md` or the material-truth skill. It names
the *techniques* those documents already imply, with Blender steps, a visible proof, a forbidden
fake, and a close condition that cannot be gamed.

**A ship, station, place, or prop leaf is not done until every technique marked mandatory for
its class is `implemented` in a `TECHNIQUE_LEDGER.json` bound to the exact candidate hash, and
each implemented row points at a still that actually shows the technique.**

`claimed`, `script_ran`, `object_count_up`, `iteration_n`, and `looks_better` are not states.

## 0. Anti-gaming

These do **not** implement any technique on this page:

- A lofted chamfer hull with boxes parented to it
- A dark box named `Recess`, `Bay`, `Radiator`, or `Canopy`
- One albedo/normal/ORM set recolored with MixRGB
- `shade_smooth()` on the whole object
- Unconditional bevel on every cube
- Triangle count, draw count, object count, or modifier count
- “Five iterations” or “three brainstorms” with the same stills defect
- Spreading MTX work across cycles (form this time, textures next time)
- A zoomed gray plate offered as a “review”
- Self-review in place of the three subagent reports in
  `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`
- Generated concept images projected as textures or used as normal/AO
- A factory/Python builder succeeding
- Promoting an unfinished body so the leaf can move on
- A modeled seat, console, bunk, cabin walkthrough, or other interior furniture that is not readable as a color mass on the live chase camera
- `bay_interior.png` or any camera inside the hull offered as a close still
- A studio three-quarter or profile where the ship fills most of the frame, labeled `play_size`

If the clay (textureless, one gray material, no emission) still reads as stacked primitives
at `play_chase.png`, **no surface technique may be marked implemented.**

## 0.5 Flyable-ship camera law (this is why Hornet stalled)

SpaceFace is a **tilted top-down chase**, not a walkaround, not a cockpit sim, not a
store-page beauty camera. Live owner: `src/render/camera.js` + ARCHITECTURE §0.14 pose.

| Fact | Value |
|---|---|
| Vertical FOV | 50° |
| Tilt | 60° from horizontal |
| Offset at heading 0 | `(0, D·sin 60°, −D·cos 60°)` |
| Yaw follow | never — the ship turns under a fixed heading |
| Default distance `D` | `CHASE_ZOOM_DEFAULT` **144** |
| Tightest legal player zoom | `CHASE_ZOOM_CLOSE` **58** |
| Starter width at 144 / 1600px | ~10.6% of frame |
| Hornet width at 144 / 1600px | ~15–16% of frame |

**Supported review cameras for every flyable remaster** (player and NPC):

| Still | Camera | What it is for |
|---|---|---|
| `play_chase.png` | D=144, heading 0 | Default play. Silhouette, planform, color blocks, wells, canopy, drives as dark holes. |
| `play_chase_abeam.png` | D=144, heading 90° | Same height, ship seen length-on. |
| `play_chase_close.png` | D=58, heading 0 | Tightest the player can legally look. Largest legal detail. |

Capture them with `tools/blender/spaceface_chase_camera.py`. Do not invent a mm-lens
studio camera and call it play size.

**Illegal as a cycle still or as MTX proof for a flyable ship:**

- Any camera closer than D=58
- Any camera inside the hull, canopy, or cabin
- A seat/console crop (`bay_interior.png` and friends)
- A hero three-quarter, starboard profile, or rear beauty where the ship occupies
  more than ~40% of frame width (default chase must stay in the ~8–22% band;
  close chase ~20–42%)

Those illegal frames may exist as **diagnostics**. They never close a row. They
never count as a cycle. A leaf that spent its cycles on seats, cabin kits, or
walkable interiors that do not read at D=58 **did not remaster the ship**.

Openings that matter are the ones the chase camera sees from above: canopy as a
framed dark rectangle, drive throats as dark wells, radiator hatches, wing
cutouts. Furniture you can only see by crawling into the mesh is
`outside_supported_view`. Do not bill it. Do not model it to close MTX-04.

Build as a **skin with holes**, not a pile of boxes. Glued-on parts leave hidden
faces the GPU still draws. Do not delete those by hand. Report them with
`tools/blender/chase_visible_faces.py` (dry-run first). Chunking, imagen/Codex
reference, and export cleanup:
[`FLYABLE_SHIP_WORKFLOW.md`](./FLYABLE_SHIP_WORKFLOW.md).

## 1. How to close a technique

Every mandatory row in the ledger must contain:

| Field | Legal values |
|---|---|
| `id` | `MTX-##` from this file |
| `state` | `implemented` \| `not_applicable` \| `blocked` |
| `still` | repo-relative PNG of the **exported** candidate showing the technique |
| `clayConfirm` | `pass` \| `fail` (required for all MTX-01–MTX-15) |
| `forbiddenFakeAbsent` | `true` only if the named fake is not in that still |
| `notes` | one sentence of what was built, not what was intended |

`not_applicable` is legal only when this file says it is (example: MTX-06 on a ship with no
wings). `blocked` keeps the leaf open. A leaf with any mandatory `blocked` or missing row
is **not done**.

Required stills for every remastered **flyable** body, from the **finalized exported GLB**,
not the working .blend:

- `play_chase.png`
- `play_chase_abeam.png`
- `play_chase_close.png`
- `clay_play_chase.png` (same camera as `play_chase.png`, one gray material)
- `grazing_close.png` (diagnostic; cannot replace a chase still)
- `orm_isolation.png` / `normal_isolation.png` / `id_or_material_id.png` on the **close chase** camera
- plus any crop named in the technique row, which cannot be the only proof

Places and stations keep their own supported views. This list is for ships that fly
under the chase camera.

## 2. Class mandates

| Class | Mandatory |
|---|---|
| Player flyable (Hornet through Wasp, Hitch is out of scope) | MTX-01–MTX-18, MTX-20–MTX-28, MTX-30–MTX-50, MTX-55–MTX-67 |
| NPC / traffic flyable | MTX-01–MTX-12, MTX-16, MTX-20–MTX-25, MTX-30–MTX-33, MTX-39, MTX-40, MTX-45–MTX-50, MTX-55–MTX-57, MTX-64, MTX-65 |
| Place / rock / station module | MTX-01, MTX-03, MTX-16, MTX-20–MTX-25, MTX-30–MTX-33, MTX-39, MTX-46, MTX-50, MTX-52–MTX-54 |

Hitch/Kestrel is never a target of this contract.

---

## 3. Form techniques (do these before any texture claim)

### MTX-01 — Mid-poly edges + weighted / custom normals

**What it is.** Game-lab default for hard surface: the *game mesh* carries the visible bevel.
Normals are weighted or custom so the large face stays flat and the highlight sits on the
bevel. This is not a high-poly sculpt and not “smooth everything.”

**Blender.** Apply object scale first (`Ctrl-A` Scale). Select hard-surface mesh. Bevel
modifier: Angle limit, width from the real edge (usually 1–4 cm at ship scale, not 4 cm on
a 2 cm lip). Segments 2. Then either:

- Data → Normals → Weighted Normal modifier (Keep Sharp, Face Influence), **or**
- Mesh → Normals → Weighted, after marking sharp edges at the bevel shoulders.

Shade **by angle** at a recorded angle (28° is the Ashline/Hitch house number). Never
`shade_smooth()` the whole object.

**Must show.** Grazing light: large plates stay flat; a thin highlight runs the edge. No
soap, no pillowing.

**Forbidden fake.** Smooth shading across a plate seam. A bevel so wide the ship looks
inflated. Bevels added before scale was applied (they will be the wrong size).

**Proof.** `grazing_close.png` (diagnostic) + `clay_play_chase.png`. Ledger records bevel width in
metres and the shade angle.

### MTX-02 — Authored cross-section loft

**What it is.** The hull (or boom, nacelle, wing) is a sequence of **real stations**:
different widths, heights, chines, and tapers that imply a formed pressure shell. Labs
loft or use a bevel-profile curve. They do not scale one cube.

**Blender.** Draw 4–8 section curves or vertex rings at the real stations (bow, canopy
shoulder, mid, waist, drive bulkhead). Loft (`Bridge Edge Loops`, Curve bevel object, or
Geometry Nodes loft). The mid station must not equal the bow station. Chines are hard
edges, not a rounded sausage.

**Must show.** Clay silhouette changes at least three times along the length. A waist or
shoulder is visible.

**Forbidden fake.** One chamfered box. Seven loft stations that are the same rectangle
scaled. A “Pressure_Hull” name on a tube.

**Proof.** `clay_play_chase.png` and `play_chase_abeam.png`. If you can describe the hull as
“a tube with stuff on it,” MTX-02 has failed.

### MTX-03 — Skin-breaking boolean with wall thickness

**What it is.** Bays, cockpits, radiator wells, and hangars are **holes**. The cutter must
leave the hull on the outside and eat volume on the inside. The remaining shell has
thickness. The mouth is empty.

**Blender.**

1. Apply all hull bevels.
2. Place a cutter so it starts ~15–20 cm **outside** the skin and ends at the intended
   depth **inside**.
3. Boolean Difference, Exact solver. Apply.
4. Inspect in wireframe: there is an opening, not an internal bubble.
5. Solidify or extrude the hole rim inward so the wall is 4–12 cm (ship-scale).
6. Build the well as **five thin walls** (floor + four sides). Do not put a solid liner
   in the same place as the cutter.
7. Re-run MTX-01 on the cut mesh (booleans wreck normals).

**Must show.** From `play_chase.png` / `play_chase_close.png` the opening is a **dark
well with a rim** in the planform. You can tell it is a hole, not a painted square.
If you have to go inside the hull to see it, it does not count.

**Forbidden fake.** Cutter entirely inside the hull (sealed void). Liner ≥70% of cutter
size at the same center. A dark plate named Recess. Stacked boxes on the skin.

**Proof.** `play_chase.png` and `play_chase_close.png`. A `bay_interior.png` crop cannot
close this row.

### MTX-04 — Readable volume in the opening, not cabin furniture

**What it is.** An opening that the chase camera can see reads as a **volume**: a darker
well, a framed canopy cavity, fins in a radiator hatch, or a drive throat. Labs do not
leave a fake black decal, and they do not spend a cycle modeling a seat, console, bunk,
or walkable cabin the bird’s-eye camera cannot resolve.

**Blender.** After MTX-03, add only what changes the chase-cam read: rim thickness, a
bulkhead color mass if it shows through glass at D=58, radiator cores that read as fins
from above, cargo that reads as stacked volume in an open well. Stop. Do not build
interior kit whose only proof is a camera inside the mesh.

**Must show.** The well or cavity is darker / deeper than the surrounding skin on
`play_chase_close.png`. A stranger does not need a crop to know it is a hole.

**Forbidden fake.** A glowing disk. A box the size of the opening. A modeled seat,
steering yoke, orange chair, or cabin walkthrough. Interior that only exists on a
hidden layer. Closing this row with `bay_interior.png`.

**Proof.** `play_chase_close.png`. `not_applicable` only when the ship has no
chase-visible opening (no canopy, bay, radiator well, or drive throat — almost never).

### MTX-05 — Panelization with gaps

**What it is.** Armor is plates with **gaps, overlaps, and thickness**, not a grid
painted on a sausage. Labs inset faces and solidify, or shrinkwrap plates onto the
hull with a 1–3 cm standoff and a visible gap.

**Blender.** On the hull, inset panel regions, extrude or solidify 2–6 cm, leave a
gap (inset another 1–2 cm as a seam channel) **or** duplicate faces, Separate,
Shrinkwrap to hull, Solidify, move along normal. Do not add a 2 cm box sitting
on the hull as a “plate” that is actually a decal-thick slab covering a metre.

**Must show.** Clay: stepped plates and dark seam channels.

**Forbidden fake.** Midship kit of six boxes on the spine. A normal-map panel grid
with no geometry step.

**Proof.** `clay_play_chase.png`.

### MTX-06 — Lofted wing / fin with root fillet

**What it is.** Lifting or stabilizing surfaces have a **section** (thick root, thinner
tip, leading-edge round, trailing-edge tight) and a **fillet** into the hull. Cards
fail.

**Blender.** Loft 3–4 airfoil or diamond sections along the span. Add a root
fairing (extra loft or boolean union + bevel). Model a flap as a separate body with
a visible slot. Leading edge can be a small-radius cylinder merged or a tight bevel.

**Must show.** Root thicker than tip. Slot or fence readable. Underside not a
blank card.

**Forbidden fake.** A scaled cube. A loft whose tip thickness is a paper sheet
and whose root is the same.

**Proof.** `clay_play_chase.png` plus a wing-root crop **only if** the root already
reads at `play_chase_close.png`. `not_applicable` only if the ship has no wings or fins.

### MTX-07 — Thin-shell canopy over a cut tub

**What it is.** Glass is a **shell** over a hole. From the chase camera it reads as a
**framed dark rectangle** in the planform, not a solid transmissive brick and not a
cockpit diorama.

**Blender.** MTX-03 a dorsal-fore tub. Model glass as Solidify of a surface 1–3 cm
thick, or four thin panes in a metal frame. Glass material: dark dielectric, low
roughness, clearcoat, **no** volume transmission through a solid. Frames are metal,
separate material. A darker cavity behind the glass is enough. **Do not model a
seat, console, or cabin kit** unless that mass is still readable at D=58.

**Must show.** On `play_chase.png`: a framed dark canopy, not a teal slab. On
`play_chase_close.png`: frames and a darker interior volume. No leather grain.

**Forbidden fake.** One teal wedge. Transmission through a solid loft (hull
texture reads as leather on the glass). Framed boxes that do not sit on a hole.
An orange seat whose only evidence is a crop inside the canopy.

**Proof.** `play_chase.png` and `play_chase_close.png`.

### MTX-08 — Manufactured drive

**What it is.** A casing you could unbolt, a ceramic or lined collar, a **throat**
(you can see into it), vanes with roots and tips, coolant that terminates on
fittings. Not a cylinder plus a glowing disk.

**Blender.** Loft or spin the casing profile (not a default cylinder if the
section is a bottle or bell). Boolean or inset the throat. Model 8–12 vanes as
tapered solids whose inner edge meets a hub. Clamps as separate mid-poly parts.

**Must show.** Rear view: dark throat, vane roots, hoop or flange.

**Forbidden fake.** Emissive circle. Torus. Cylinder with rings.

**Proof.** `drive_rear.png`.

### MTX-09 — Radiator cassette in a well

**What it is.** Cooling is thin fins in a recessed frame with header pipes.

**Blender.** MTX-03 the well. Frame. 6–10 thin fin plates. Header tubes that
meet the frame. No emissive.

**Must show.** Fins and a dark well.

**Forbidden fake.** An orange box. A glowing grate.

**Proof.** Radiator crop.

### MTX-10 — RCS / sensor as hardware

**What it is.** Thruster clusters sit in a bay. Sensors are dishes, heads, or
masts on gimbals. Never a neon hoop.

**Blender.** Small nozzles (cylinders with throats) in a boxed bay. Dish:
spun curve or inset cylinder, not a torus. Pedestal + yoke.

**Proof.** Crop. `not_applicable` only if the ship truly has neither.

### MTX-11 — Cables and hoses as curves

**What it is.** Service runs are curves with thickness and **end fittings**,
routed along structure, not floating.

**Blender.** Bezier or NURBS. Bevel depth = hose radius. Convert to mesh.
Add fittings (small cylinders/nuts) at both ends that touch a port.

**Forbidden fake.** A long box. A hose that ends in empty air.

### MTX-12 — Fasteners only at interfaces

**What it is.** Bolts, clamps, and rivets exist where parts meet. Labs do not
sprinkle studs on every face.

**Blender.** At LOD0, model hex or cap screws at plate corners, hatch hinges,
and clamp bands. Instance on points, then realize for export if glTF will not
keep instances.

**Forbidden fake.** Procedural corner studs on curved metal. A thousand
identical cubes.

### MTX-13 — Scale-correct bevels after apply

**What it is.** Bevel width is in world metres after scale is 1,1,1.

**Blender.** Apply scale. Measure a real edge. Set bevel to that. Re-check
sockets and collision.

**Forbidden fake.** Bevel 0.04 on every object regardless of size.

### MTX-14 — Broken symmetry from service

**What it is.** The hull may be mirrored to start. Wear, a patch, a stencil,
or a missing tile breaks the mirror so it does not look generated.

**Blender.** Apply mirror. Add one repair plate, one stencil, or one replaced
tile off-center.

**Forbidden fake.** Random cubes on one side with no story.

### MTX-15 — Post-boolean normal repair

**What it is.** After every boolean, weighted normals and sharp edges are
redone. Black spikes and shading waves are defects.

**Blender.** Merge by distance. Weighted normals. Mark sharp. Grazing check.

**Proof.** `grazing_close.png` has no black holes on the cut rim.

---

## 4. UV techniques

### MTX-16 — Unique UV0 on the bake target

**What it is.** The meshes that receive AO/normal/curvature have **non-overlapping**
UV0. Overlap is allowed only on instances that share a bake (repeated bolts).

**Blender.** Smart UV is a start, not a finish. Unwrap by organic/angle for
curves, follow active quads for plates. Island margin ≥ 0.008. Check Overlap
in UV editor. Average island scale.

**Forbidden fake.** Smart Project on the joined ship with overlapping hull
islands. That is why Hitch’s unique bake failed once. Do not “skip unique
bake” to close this row.

**Proof.** UV layout export `uv0_layout.png` with Stretch overlay. Overlap
count = 0 on bake targets.

### MTX-17 — Even texel density

**What it is.** Hero surfaces share a density (for a 16 m ship, about
256–512 px/m on LOD0). Tiny bolts can be denser; a wing cannot be 64 px/m
while a hatch is 2048.

**Blender.** Texel Density checker addon or measure island area vs mesh
area. Rescale islands.

### MTX-18 — UV1 for tiling detail

**What it is.** UV0 is unique (bake). UV1 is a tiled space for micro-normal
or dirt (orange peel, brushing). Game labs almost always have two UV sets
on heroes.

**Blender.** Copy UV0, scale UV1 up 4–12×. Export both. Runtime must bind
detail to UV1, not overwrite UV0.

**Forbidden fake.** Tiling the unique bake (seams become a grid).

### MTX-19 — Seam placement

**What it is.** UV seams hide in panel gaps and on unseen backs. Hard
normal edges match UV splits.

**Blender.** Mark seams in the MTX-05 channels. Do not run a seam across
a smooth belly unless the panel is real.

---

## 5. Bake techniques

These maps must be **computed from the mesh**, then painted. Image generation
is not a bake.

### MTX-20 — High or bevelled-high source

**What it is.** The bake source has smaller bevels and extra bolts/seams.
It can be a sub-d cage or a mid-poly with tighter bevels. It cannot be
the same box you ship.

**Blender.** Duplicate the game mesh. Tighter bevels, extra inset seams,
more fasteners. Or boolean-high then remesh/clean. This is the *high*.

### MTX-21 — Cage

**What it is.** A slightly inflated copy of the low that contains the high
without skipping or exploding.

**Blender.** Duplicate low, Alt-S inflate 2–8 cm, fix intersections.
Bake using Selected to Active + cage object.

**Forbidden fake.** Ray distance guessed until the normal map is less
terrible. Exploded rays on the wing root.

### MTX-22 — Tangent normal bake (OpenGL, MikkT)

**What it is.** World-space is not a game normal map. SpaceFace is OpenGL
(+Y). MikkT.

**Blender.** Cycles bake Normal, Tangent, OpenGL. 16-bit PNG. No
compression until KTX2 later.

**Must show.** `normal_isolation.png`: bevels and panel steps visible,
no rainbow seams on flat plates, no inverted islands (green not flipped).

### MTX-23 — Ambient occlusion bake

**What it is.** Mesh AO: dirt in holes, contact darkening. Not a constant
in the ORM red channel.

**Blender.** Cycles bake AO on unique UV0. 16-bit. Invert only if the
pipeline expects it (SpaceFace ORM: R = AO, typically dark in cavities).

**Must show.** `orm_isolation.png` red or a dedicated `ao.png`: bays and
seams darker than open plate. Standard deviation of AO is **not** zero.

**Forbidden fake.** A flat 0.8 fill. Filename containing “orm” that is
actually a normal.

### MTX-24 — Curvature bake

**What it is.** Convex edges light, concave dark (or the inverse, but
pick one and document it). This drives edge wear.

**Blender.** Pointiness in Eevee/Cycles attribute, or a curvature bake
addon, or bake from a slightly inflated/deflated normal difference.
Export 8- or 16-bit.

**Must show.** `curvature.png`: edges of plates and bevels read.

### MTX-25 — Cavity / concave

**What it is.** Only the pits: bolt wells, panel gaps, bay corners.

**Blender.** Pointiness clamped to concave, or AO at a very short
distance. This is the dirt mask.

### MTX-26 — Thickness

**What it is.** Thin parts (fins, vanes, glass) vs thick hull. Dirt and
heat treat them differently.

**Blender.** Ambient occlusion with inverted normals, or a thickness
bake addon.

### MTX-27 — Position / world-up gradient

**What it is.** A map from keel to spine (or bow to stern) so dust and
streaks have gravity or airflow.

**Blender.** Geometry → Position, separate Z or X, color ramp, bake
emit. Document the axis.

### MTX-28 — Material ID

**What it is.** Flat colors per substance so paint work cannot bleed:
hull paint, bare metal, glass, ceramic, rubber, stencil.

**Blender.** Emission materials per ID, bake emit. `id_or_material_id.png`.

### MTX-29 — Bent normals (player heroes only, optional extra)

**What it is.** A bake of average unoccluded direction. Improves
indirect light on mid-poly. Optional on NPC.

### MTX-30 — Mesh-derived only

**What it is.** No generated beauty frame may be used as normal, AO,
roughness, metallic, or curvature. If imagen was used, it is a
construction reference only.

**Proof.** Ledger lists the bake operator and the source mesh name.

---

## 6. Surface techniques

### MTX-31 — Classify the substance first

**What it is.** Write the bill, then set Principled. Paint is dielectric.
Steel/nickel is metallic. Ceramic is dry nonmetal. Glass is glass.
Rubber is rubber only on seals.

**Forbidden fake.** One Principled, five names.

### MTX-32 — Unique albedo, not a tinted shared sheet

**What it is.** Base color comes from the bake + hand paint + stencil
on **this** UV. Sharing the Wasp hull sheet and mixing a tint is the
factory failure.

**Blender.** Start from AO × base paint color. Add cavity dirt, heat,
stencil. Export sRGB albedo.

**Must show.** `material_three_quarter.png`: plates do not share one
wood/leather grain across hull, glass, and metal.

**Forbidden fake.** MixRGB 0.74 toward a tint on `hull_basecolor.png`
from another ship.

### MTX-33 — Authored ORM

**What it is.** R = AO (MTX-23), G = roughness (paint ~0.35–0.55, worn
metal ~0.25–0.45, ceramic ~0.55–0.7, glass ~0.04–0.1), B = metallic
(0 paint/glass/ceramic, 1 bare metal). Channels vary. Flat G is a
known SpaceFace defect class.

**Must show.** `orm_isolation.png` with visible G variation on edges
and cavities.

### MTX-34 — Paint + clearcoat + orange peel

**What it is.** Hull paint: metallic 0, clearcoat 0.3–1.0, coat
roughness 0.03–0.15. Micro-normal (UV1) for orange peel. Not a
mirror, not clay.

### MTX-35 — Machined metal

**What it is.** Bare steel/nickel: metallic 1, roughness from
brushing. Prefer a directional anisotropy map or a stretched
micro-normal along the machine direction. Not a gray plastic.

### MTX-36 — Thin glass

**What it is.** See MTX-07. Dark, coat, interior, no solid
transmission blob.

### MTX-37 — Ceramic / heat shield

**What it is.** Collar and tiles: metallic 0, high roughness, tan/gray,
heat gradient from MTX-27/MTX-41. Not chrome.

### MTX-38 — Rubber only on seals

**What it is.** Gaskets around glass and hatches. If it is not a seal,
it is not rubber and must not use a leather/rubber grain.

### MTX-39 — Cavity dirt

**What it is.** Multiply dirt into albedo and raise roughness in
MTX-25 cavities. Dirt is brown/gray, not black crayon.

### MTX-40 — Edge wear from curvature

**What it is.** Convex MTX-24 edges reveal bare metal (or primer)
and lower roughness slightly. Wear is on corners that get hit,
not a noise texture everywhere.

### MTX-41 — Heat stain

**What it is.** Exhaust, radiator, and reentry faces get a
blue/straw/purple metal gradient or baked ceramic darkening,
driven by proximity to the throat (MTX-27).

### MTX-42 — Stencil as spray

**What it is.** Markings are opacity on the paint, with overspray
and broken edges. They have **no** thickness.

**Forbidden fake.** A raised plaque. A perfect vector on a separate
box.

### MTX-43 — Decal atlas (LOD0 micro)

**What it is.** Screws, labels, and small warnings can be atlas
decals on cards or projected UVs at mid distance. Modeled at
close interfaces (MTX-12).

### MTX-44 — Detail normal on UV1

**What it is.** Overlay a tiling micro-normal (peel, brush, grit)
on UV1 in the shader or as a baked composite. Must not replace
the unique MTX-22.

### MTX-45 — Recessed emission

**What it is.** Lights live in a slit, a lamp house, or a throat.
Review with emission off: the fixture still exists.

**Forbidden fake.** A bright disk on a surface. A glowing torus.

### MTX-46 — Forbidden reads stay forbidden

Plastic toy, clay blockout, leather-on-metal, LEGO stack, neon hoop,
DCC default Principled. Any one of these in a supported view fails
the leaf, regardless of other rows.

---

## 7. LOD and export

### MTX-47 — LOD0 keeps construction

Cavities, frames, vanes, cables, fasteners at interfaces, glass
shell. If LOD0 is the loft+boxes factory mesh, fail.

### MTX-48 — LOD1 keeps openings and material breaks

Do not collapse the bay closed. Do not merge glass into hull.
Bake MTX-12 micro into normals.

### MTX-49 — LOD2 is the silhouette

Role must still read at ~40 px. No need for bolts.

### MTX-50 — Export contract

Apply modifiers. Triangulate. Custom/weighted normals preserved.
+X forward, metres, sockets, non-render collision. OpenGL normals.
ORM as authored. Do not hand-edit generated manifests.

### MTX-51 — Lookdev stills from the exported GLB

Clay, material, grazing, ORM iso, normal iso, ID. Working-blend
beauty shots do not close a row.

---

## 8. Places and rocks

### MTX-52 — Macro form from reference, not a primitive

Rocks and wrecks start from sculpted or scanned mass. An
icosahedron, tetrahedron, or UV sphere is blockout only.

### MTX-53 — Sculpt or photogrammetry bake

High-frequency rock detail is a normal+AO bake from a sculpt or
scan, not a noise shader on a sphere.

### MTX-54 — No silent revert

Replacing an accepted rock, dock, or wreck with a primitive or
an older worse mesh is a P0. Side-by-side stills vs the previous
accepted candidate are required before any replace. If the new
one loses, keep the old file.

---

## 8b. Raised bar (25–50% above Hitch-plus loft-and-bake)

These are mandatory on player ships. They exist because a correct
mid-poly bake can still look like a 2014 asset-flip.

### MTX-55 — Role silhouette at 40 px and 120 px

**What it is.** At stamp size the ship is still an interceptor,
barge, or hauler. Negative space (wing cutouts, twin booms, tower)
carries identity, not decals.

**Must show.** Downscale `play_chase.png` to 40 px wide. A stranger
can name the role. If it becomes a gray capsule, fail.

### MTX-56 — Value hierarchy

**What it is.** At least three distinct values: dark mechanical
wells, mid paint, light or saturated accent. Readable at 120 px.

**Forbidden fake.** Whole ship one taupe.

### MTX-57 — Visible shell thickness

**What it is.** Every opening shows a wall 4–12 cm, not a paper
hole or a solid plug.

**Must show.** `play_chase_close.png` includes the rim as a thickness, not a paper cut.

### MTX-58 — High that is actually higher

**What it is.** The bake high has smaller bevels and extra
hardware versus the game mesh — not a duplicate with a
Bevel 0.01 instead of 0.04.

**Proof.** Note high vs low bevel widths. If they match, fail.

### MTX-59 — Reads at play distance

**What it is.** Materials and big openings still identify the
ship on the **live chase camera**. Studio-only beauty is not
enough. This row is the close condition for the whole flyable
remaster, not an extra still.

**Proof.** `play_chase.png` (D=144). Role, 2+ materials, canopy
or drive wells, and silhouette still read when the ship is
~10–16% of frame width. A `play_size.png` shot from a 48 mm
studio camera does not satisfy this row.

### MTX-60 — Designed asymmetry

**What it is.** One authored repair, stencil, or replaced tile
off-center. Not random cubes.

### MTX-61 — Joint language

**What it is.** Where plates meet: a gasket, weld bead, or
countersink — modeled or in the unique normal — not a noise
texture.

### MTX-62 — Separated moving parts

**What it is.** Flaps, hatches, turrets, or canopy are separate
bodies with a visible gap even if they never animate.

**Forbidden fake.** A painted hinge.

### MTX-63 — Two-scale surfaces

**What it is.** Unique bake carries meso (panels, AO). UV1
micro does not replace missing panel geo.

### MTX-64 — Rest areas

**What it is.** Large quiet plates exist. Detail is clustered
at access, heat, and joints. A ship covered in equal greeble
fails.

### MTX-65 — Role-specific massing

**What it is.** An interceptor is not a barge with wings glued
on. Clay masses differ by role. Sharing one factory hull
envelope across Hornet and Atlas fails this row for both.

### MTX-66 — Specular by manufacture

**What it is.** In grazing light, paint, brushed metal, and
ceramic do not share one highlight.

### MTX-67 — Designed accent, not cyan brick

**What it is.** One controlled color beat (warning, faction,
canopy) that is not a leftover teal wedge or a 2 cm rail.

---

## 9. Blender session order (do this, in this order)

1. Freeze identity (sockets, collision, silhouette, role).
2. MTX-02 hull stations. Clay.
3. MTX-03 / 04 chase-visible wells only. Clay on `play_chase`. No seats.
4. MTX-05–12 hardware. Clay. If clay is still primitives, **stop**.
5. MTX-01 / 13 / 15 normals.
6. MTX-16–19 UVs.
7. MTX-20–30 bakes.
8. MTX-31–46 surfaces in Material Preview on the **whole** ship.
9. MTX-47–51 LOD and export. MTX-55–67 raised bar.
10. Run `MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md` for a full cycle (three
    valid stills + three subagent reviews + implement all revises).
11. Repeat that full-job cycle at least five times. Then fill the ledger.

Do not start at step 8. A textured sausage is still a sausage.
Do not split steps 2–9 across the five cycles. Each cycle is a full
attempt.

## 10. Ledger location

`assets/ships/<package>/evidence/<ship_id>/TECHNIQUE_LEDGER.json`

Schema: `docs/visual-assets/TECHNIQUE_LEDGER.template.json`.

The implementing agent fills it. The implementing agent **cannot**
mark the leaf done. A second pass (human or a later agent that did
not author the mesh) must set `independentReview: keep|revise|revert`
on the whole asset. `keep` is illegal if any mandatory row is not
`implemented`, if clay still reads as primitives, if fewer than five
valid review cycles exist, or if old cycle stills were not cleaned up.

Review cycles follow
[`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](./MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md).
