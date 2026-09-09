# Works conduit kit — reference brief and Cycle 03 construction correction

**Asset:** `place_works_conduit_*` (PQ-131.06). **Class:** place/prop, works camera only. **Tier:** C
(repeated manufactured families). **State:** `design_candidate`. Cycle 3 of the kit (both families
rebuilt after Cycle 02 was rejected). This page is the construction contract. Do not import
third-party geometry or textures.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same camera, object at frame edge),
`works_site` (19 px/cell). All 1920×1080, 31° perspective, Blender +Z up, origin at cell centre.
Never orthographic. No fog. No studio three-quarter.

Stand-in this kit replaces: procedural overlay runs in `src/ui/asteroid/asteroidRenderer3d.js`
(`rebuildOverlays`) and the 2D painter in `src/ui/asteroid/asteroidRenderer2d.js`
(`paintOverlayNetworks`). Those are scaffolding. Flat coloured lines on the rock are illegal
(campaign §6; owner complaint that created PQ-130.10b / PQ-131).

This unit authors the **source candidate only**. It does not wire `loadWorksPart`, does not delete
the procedural builder, does not release, and does not mark PQ-131.06 complete.

---

## What a person sees from above

Two networks, two objects, never two glow colours.

1. **Power cable** — a narrow galvanized **ladder tray** bolted to the floor or wall, one
   **gold-jacketed armoured cable** clamped into it, section depth you can read at the screen edge.
   The only light is a **recessed contact** the size of a gland window. The jacket does not emit.
2. **Material lane** — a wider **framed roller conveyor**: two C-section rails, **rollers on axles
   through those rails**, a **dark belt or chain** sitting on the crowns, and a **narrow smoked
   cover strip** over the product path only. It is not a cyan ribbon, not a glass tube, not a neon
   chevron.

At 120 px/cell a piece is 120×120 px. At 19 px/cell it is 19×19 px. Site register must still read
**two families** by section and material (gold jacket vs dark belt/rollers), not by bloom.

---

## Cited construction (do not copy meshes)

Local game law, then industrial practice. Geometry is original; these sources decide *what the
parts are*.

### Game / mask (binding)

| Source | What it locks |
|---|---|
| `design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §4 row `.06` | Two families; straight / corner / T / cross / end-cap / junction-box; 1 cell; hooks `powered` and `flow_mesh`; 1–2k tris; one 1024² atlas per family |
| `design/ASTEROID_WORKS_DESIGN_LAW.md` §2.7, §7 | Networks are objects on the board; gold cable identification; lane flow toward the port; no emissive paint standing in for a body |
| `src/systems/siteLogistics.js` `connectivityMask` | 4-bit N=1 E=2 S=4 W=8; machines conduct; components are the islands |
| `src/ui/asteroid/asteroidRenderer3d.js` overlay rebuild | Shared cells split off-centreline; junction is a fitting at 3+ arms; armour present at both zoom registers; width is a real section, not a hairline |
| `tools/blender/spaceface_works_camera.py` | 2.2 wu cell, 31° FOV, `works_top` / `works_edge` / `works_site` |
| Rover builder `tools/blender/build_works_rover.py` | Works-scale Z-up, LOD0/1/2 name contract, Y-up glTF extras, atlas PBR, evidence beside the works camera |

Exact port numbers: `PORT_CONVENTION.json` in this folder.

### Cable tray and armoured cable (ART EXTRAPOLATION on Helix/MTS field kit)

| Citation | Use |
|---|---|
| IEC 61537 (cable tray and cable ladder systems) | Ladder vs solid-bottom vs wire-mesh classes; load rating as a formed steel channel with rungs, not a painted strip |
| NEMA VE 1 / VE 2 (metal cable tray systems and installation) | Splice plates at fittings, bonded joints, hold-down clamps, fittings as manufactured elbows/tees/crosses — not two straights overlapping |
| IEC 60502-1 / BS 5467 steel-wire-armoured (SWA) practice | Conductor → insulation → bedding → **helical steel wire armour** → extruded jacket. Armour is visible at glands and under saddle clamps |
| IEC 60364 / BS 7671 support spacing | Clamps are periodic and **rooted on the tray**; a cable does not hover |
| IEC 62444 cable glands | Junction entries are glands (thread, locknut, seal) not holes in a box |
| IEC 60670-1 / NEMA 250 boxes | Service enclosure with a removable lid, mounting brackets, and an interior that could accept terminals |

Jacket colour is **not** an IEC phase colour. Law §7 wants a warm gold identification (`--aw-gold`
family) on the power run. We treat that as a **restrained brass-gold LSZH jacket** — dielectric,
dirty, darker than a light. Emission stays inside the contact window.

### Roller conveyor (ART EXTRAPOLATION)

| Citation | Use |
|---|---|
| CEMA roller-conveyor practice (unit-handling rollers, bearings, frames) | Side frames are structural C-sections; rollers are tubes on axles; axles live in the frames |
| Motor-driven roller (MDR) / 24 V zone practice (Interroll-class, as a type not a brand copy) | A junction or T can carry a **drive interface** (gearmotor stub, sprocket, chain run) instead of a magic glowing bed |
| ISO 15312 / ordinary deep-groove bearing practice | Bearing bosses are real cylinders in the rail, not painted dots |
| Polycarbonate machine-guard practice | A cover exists where product could jump; it is a **narrow strip**, not a neon lid over the whole cell |

The live procedural tray used a translucent full-width lid and a cyan core. That is the stand-in
this kit is here to kill. Flow is the **belt/chain mesh** (`flow_mesh`), UV-scrolled along U.

---

## Fiction (ART EXTRAPOLATION unless noted)

Helix Directorate / MTS claim crews run two services through bored galleries: a **single-core
armoured power run** in a ladder tray, and a **low-profile roller lane** that carries ore toward
the cargo port (canon: tunnels are streets; law §7). Both are field-bolted, galvanized, repaired
with whatever gland is on the truck. Gold jacket is the site convention for live power — the same
warm gold the chrome uses for attention — **as paint/polymer, not as a light**.

Forbidden reads: toy pipe, neon vein, cyan glass, a box with a decal clamp, two boxes crossed to
fake a tee, a ribbon that only exists as bloom.

---

## Modular kit (committed)

1 cell = **2.2 wu**. Every piece fits inside ±1.1 on X and Y and stays under ~0.40 wu tall.
Origin at cell centre. Ports sit on the cell faces.

| Kind | Ports (Blender) | Manufacture |
|---|---|---|
| `straight` | −X, +X | One ladder / one frame, rungs or rollers along the run |
| `corner` | +X, +Y | Swept elbow, inner radius set so the tray is one fitting |
| `t` | −X, +X, +Y | Through-run plus a welded saddle branch and a splice block |
| `cross` | ±X, ±Y | Four-arm fitting around a manufactured centre body |
| `end` | +X | Bulkhead + gland (power) or belt return / end stop (lane) |
| `junction` | ±X, ±Y | Service box, **removable lid**, glands or drive interface, L-brackets |

Floor and wall share the same local mesh: **+Z is away from the mount**. Wall = +90° around the
run axis. Brackets exist on z = 0 so a wall pose still has a mount.

Hooks (exact names):

- Power pieces: `powered` (empty) + `LOD{n}_powered` contact mesh.
- Lane pieces: `flow_mesh` (empty) + `LOD{n}_flow_mesh` belt/chain mesh, U along travel.

Junctions also ship `service_lid` so the lid is a separate object, not a texture.

Root node: `place_works_conduit_{family}_{kind}` with extras `family`, `kind`, `ports`.
LOD meshes: `LOD{n}_Merged_Material_Atlas` plus the hook meshes. Collision helper optional.

---

## Families — silhouette at 120 px

### Power (narrow)

From above: a **dark steel U** with **rungs**, a **gold sausage** in the trough, **dark saddles**
crossing it, a **tiny bright slot** on one clamp or gland. From the edge: tray height, cable
sitting *in* the tray, clamps wrapping it, feet on the pad.

### Lane (wide)

From above: **two dark rails**, **roller tubes** visible left and right of a **narrow smoked
strip**, **dark belt** in the middle (not cyan). From the edge: rail height, rollers as cylinders
with axles into the rail, belt on top of them, cover strip above the belt only.

If clay (one grey material, emission off) cannot tell the two families apart, the kit has failed.

---

## Material / atlas

One original **1024²** basecolor / normal / ORM per family. Unique non-overlapping UV0 on that
family's bake targets (LOD0 packed together; LOD1/LOD2 packed in reserved bands). Mesh-derived AO
in ORM.R and multiplied into albedo. Mesh-derived tangent normals plus role microstructure
(longitudinal jacket striations, helical armour, roller hoop grind, belt cleats). **No generic
plate grid, no universal dirt stamp, no billboard glow.**

Emission: basecolor **alpha** → Principled emission strength, same trick as the rover atlas. Alpha
is 0 everywhere except the power contact window.

---

## Budgets

| LOD | Role | Triangle intent (per piece) | Draws |
|---|---|---|---|
| 0 | works_top / works_edge | 1000–2000 | 1 atlas + 1 hook mesh |
| 1 | cheaper work/site | ~400–800, same section and ports | same |
| 2 | site topology | ~80–250, width/height of the family preserved | same |

Textures: 1024² × 3 maps × 2 families. Shared materials are truly shared inside a piece and
inside the master kit scene.

---

## Quality axes (grade these)

1. **Snap** — port sections of a family match at 1.1 wu; two straights butt with no gap/overlap.
2. **Manufacture** — corner/T/cross are fittings; end caps terminate; clamps/rollers are rooted.
3. **Two families at site** — gold tray-cable vs dark roller lane, **without** turning emission on.
4. **Powered is a slot** — clay + emission-off still reads as a cable in a tray.
5. **Lane is not a ribbon** — rollers and belt exist; cover is a strip; no cyan.
6. **Works camera** — stills are `works_top` / `works_edge` / `works_site`, not a beauty crop.
7. **Envelope** — every piece inside one 2.2 wu cell.

G0–G7: cycle 3 is `evidence_ready` only. Whole-asset G1/G2/G4 stay open pending independent
review of `evidence/cycle_03/` at 1:1. Cycle 01 and Cycle 02 stills stay on disk as history.
This candidate is not accepted art. Runtime G6 and independent G7 are not claimed.

Working scene: `tools/blender/build_works_conduit_kit.py` →
`assets/works/conduit_kit/source/` and `assets/ships/parts/works/place_works_conduit_*.glb`.

---

## Cycle 03 construction correction (this cycle)

Independent review of Cycle 02 (`3d2f0395`) rejected the candidate. Nine supported-camera
failures, both families. Power freeze from Cycle 01 does **not** survive that review.

1. **Junctions are service boxes, not cell cubes.** Power and lane junction enclosures sit in
   the hollow of four stubs, with a removable lid (lip, fasteners, handle) and glands at the
   entries. The box is ~0.5 wu, not a 1.1 wu slab.
2. **T/cross are fittings.** Power: U-channel arms plus inner arcs and a bonded splice — no
   filled square. Lane T: continuous far rail, gapped near rail, branch rails meeting the
   opening, thin transfer plate. Lane cross: four arms plus inner fillets. No overlapping
   full-length straights, no four disconnected stubs.
3. **Gold jacket is protected.** Tray lips occupy real pixels at 120 px/cell. The jacket sits
   in the trough and is interrupted by rooted saddles. Armour shows at clamps and glands.
   Emission stays in the contact window.
4. **Lane is a roller conveyor.** Thicker C-rails, larger rollers, a narrow belt on the
   crowns, a smoked cover strip over the product path only. Not a recolored power cable and
   not a black ribbon.
5. **Ends are hardware.** Power: bulkhead + gland + short armour pigtail. Lane: return
   pulley, end stop, motor on the side rail.
6. Port envelope unchanged: power 0.48 × 0.20, lane 0.76 × 0.26, ports on the cell face.

Cycle 03 does not claim KEEP. Independent review of `evidence/cycle_03/` decides.
