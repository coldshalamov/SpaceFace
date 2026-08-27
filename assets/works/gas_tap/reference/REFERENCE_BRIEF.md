# Works gas tap — Cycle 01 reference brief

**Asset:** `gas_tap` (PQ-131.07). **Class:** place/prop, works camera only. **Tier:** C (supporting modular machine; one manufactured family).
**State:** `design_candidate`. Cycle 1 of ≥5. This page is the contract for later cycles.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same, object at frame edge), `works_site`
(19 px/cell). All 1920×1080, 31° perspective, +Z up, origin at cell centre, underside at z = 0.
Never orthographic. No fog. No studio three-quarter. Camera owner:
`tools/blender/spaceface_works_camera.py` (live numbers from `src/ui/asteroid/asteroidRenderer3d.js`).

Scale stand-in: the live procedural `makeMachine('gas_tap')` in
`src/render/asteroidInteriorPreview.js` (sphere tank + torus strap + turbine). That stand-in is the
**failure class**, not a form to remaster: it reads as a medical/pressure vessel, not a wall tap.
Cell size `S = 2.2` wu. At 120 px/cell a one-cell machine occupies ~120 × 120 px; this asset must
read as clamp + manifold + wheel/gauge asymmetry at that size, and still point at the pocket at
19 px/cell.

`componentReferenceDecision`: `native_imagegen`. Generated construction studies are **quality
targets under a frozen identity contract**. Do not copy their geometry, textures, livery, or
lettering onto the mesh.

---

## Frozen identity (from live law, not from generated pixels)

| Anchor | Source | Value |
|---|---|---|
| Role | `src/data/sites.js` `sm_gas_tap` | “Safely interfaces sealed gas pockets without breaching them.” |
| Board sentence | `design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §4 `.07` | “A valve manifold clamped to a wall face with a pressure gauge and a short hose into the pocket — tapping, not breaching.” |
| Geology | `design/ASTEROID_WORKS_DESIGN_LAW.md` §1 law 3 | Sealed gas pockets tap as generator fuel; nicking one vents it. |
| Pocket look | Law §3.5; `makeGasCoreGeo` | Cracked cell, dark centre `#2b2d1f`, danger colour stays on the **cell**, never the machine. |
| Placement | `asteroidRenderer3d.js` contact ring | Sits in a bored cell; only contacts **gas** faces. +X is the wall/pocket normal. |
| Machine language | Campaign §4; Law §2.7 / §4 | Dark metal, one hooded lamp. Rover yellow is banned. No emissive outlines, bars, or halos. |
| Hooks | Campaign §4 `.07` | `valve_wheel` (spins when active), `gauge_needle`, `lamp`. |
| Envelope | Campaign + this brief | 1 cell, underside z = 0, +Z up, +X into the pocket. |
| Budget | Campaign §4 `.07` | LOD0 ≤ 6k, LOD1 ≤ 1.5k, LOD2 ≤ 500, 1024² maps. |
| Root / LODs | this packet | Root `SF_WORKS_GAS_TAP_V1`; `LOD0_gas_tap` / `LOD1_gas_tap` / `LOD2_gas_tap`. |

**Forbidden reads (named by the packet):** turret, hydrant, random pipe tree, medical tank, glowing
icon, box with a wheel. Also: Rover `#ffd23f`, plastic copper, default tubes/tori, generic
grids/noise, floating hose, billboard gauge, halo or emissive wheel.

---

## Fiction (ART EXTRAPOLATION unless noted)

Canon: independent claim crews farm sealed pockets instead of venting them
(`sites.js` description; Law §1). Manufacturer of this **specific pattern** is not named in
worldbuilding sheets. **ART EXTRAPOLATION:** a Helix-licensed / MTS-traded field tap kit — the same
sales channel as the gallery crawler (`assets/works/rover/reference/REFERENCE_BRIEF.md`) — issued as
a wall-mounted clamp manifold, not as a vessel. Helix/MTS canon is the legal-corporate / commodity
membrane (`docs/worldbuilding/sheets/factions/helix.md`, `mts.md`); this hardware is extrapolated
from that channel, not from a named foundry.

A crew drills a dead-end approach cell, bolts a formed backplate to the pocket face with saddle
clamps, drives a short protected lance through a packed gland into the sealed body, and reads
pressure on an analog gauge before opening a globe valve. The valve does not “mine” the cell; it
**taps** it. Outlet is a flanged stub for later conduit, not a tank on this cell.

---

## Cited construction studies (do not copy)

Real-world manufacturing grammar this asset translates — cited so the mesh has a job, not so it
becomes a clone:

1. **Clamp-on wall manifold / API 6A-style clamp connection.** Saddle or clamp hubs bolt a
   pressure joint onto a body without welding the rock. Selected: four corner clamp blocks, formed
   backplate with return flanges, visible stand-off, hex fasteners at the interfaces. Rejected:
   Christmas-tree vertical valve stacks (turret), wellhead “hat” that reads as a hydrant.
2. **Globe / gate valve with yoke and rising stem.** Flow through a cast body; stem is the
   operator axis; handwheel is a formed rim with spokes and a hub nut, with glove clearance over
   the yoke. Selected from `ref_04_handwheel_yoke.jpg`: C-section rim, spoke-to-hub meeting, hex
   nut, grease on the stem, yoke legs. Rejected: cracked rim as identity, hollow open stem,
   pressed-tin toy wheel, torus doughnut.
3. **Analog pressure gauge (ASME B40.100 grammar).** Cylindrical case, stepped bezel, recessed
   glass, dry printed face, needle rooted on a centre boss, socket fitting. Selected from
   `ref_02_analog_gauge.jpg`: brass bezel / steel case, real glass window, needle on a boss,
   packed elbow. Rejected: garbled duplicate numerals, extra face screw as a second boss, digital
   display, billboard disc.
4. **Protected short hose (SAE 100R / mining hydraulic grammar).** Rubber tube, helical wire
   armor, hex unions that seat on nipples, a saddle clamp so the run is supported. Selected from
   `ref_03_protected_hose.jpg`: armor ridges, brass union, steel saddle, rigid lance into rock.
   Rejected: disconnected open coupling, rebar-wrapped lance, long occupancy tail, floating Bezier.

`ref_01_overhead_manifold.jpg` is the assembly study: plate + four clamps + globe body + wheel +
offset gauge + short hose into a crack. Selected: wall mount, clamp blocks, material split
(painted plate / bare valve / brass / rubber), tap-into-rock. Rejected as identity: green painted
wheel (adjacent to Rover yellow), hose laid as a long face-run, missing lamp, thin pressed wheel,
any whole-asset silhouette copy.

---

## Silhouette from directly above (the view that matters)

Four shapes a person resolves at ~120 × 90 px. If the outline is a box with a circle on it, fail.

1. **Clamp bar** — dark painted backplate along the +X wall, with corner clamp blocks proud of the
   plate. The longest mass, against the pocket.
2. **Handwheel** — large circular rim with a dark hub, offset slightly +Y of centre. The identity
   circle.
3. **Gauge** — smaller circle on the −Y side. Asymmetry. Not a second wheel.
4. **Tap stub** — short hose/lance continuing +X past the plate, into the pocket. Direction cue.

Edge view must show **stand-off**: clamp feet on the rock, plate off the wall, valve body in the
room. Site view must keep (1) + (2) + (4) as a bar + circle + tap, without outlines or glow.

---

## Proportions (committed)

1 cell = 2.2 wu. Envelope **≤ 2.10 × 1.90 × 1.00 wu**. Origin at cell centre. +X = wall/pocket
normal (lance). +Y = port along the wall. +Z = up. Underside of clamp feet / plinth at z = 0.

| Part | wu (approx) |
|---|---|
| Envelope L(X) × W(Y) × H(Z) | 1.05 × 1.72 × 0.96 |
| Backplate web (Y × Z, thickness X) | 1.52 × 0.78 × 0.10 |
| Plate X (room face → rock face) | 0.86 → 0.96 |
| Clamp-foot rock contact X | 1.02 → 1.08 |
| Lance tip X (short occupancy) | ≤ 1.16 |
| Handwheel diameter | 0.72 |
| Gauge face diameter | 0.30 |
| Hose centreline length | ≤ 0.42 |

Hooks (exact names): `valve_wheel`, `gauge_needle`, `lamp`.
Root node: `SF_WORKS_GAS_TAP_V1`. LOD meshes: `LOD{n}_gas_tap` plus hook children
`LOD{n}_valve_wheel`, `LOD{n}_gauge_needle`, `LOD{n}_lamp`.

### Hook mechanics

| Hook | Pivot | Local axis | Motion |
|---|---|---|---|
| `valve_wheel` | hub centre, on the stem | local +Z = stem (world +Z) | spins about local +Z when the tap is active |
| `gauge_needle` | needle root at face centre | local +Z = face normal (world +Z) | rotates in the face plane; rest points +Y (12 o’clock) |
| `lamp` | lamp-glass centre under the hood | local +Z = hood axis (world +Z) | emissive slot only; fixture remains with emission off |

Wheel mesh is parented to `valve_wheel` and must clear the yoke. Needle mesh is parented to
`gauge_needle` and stays **inside** the case, under the glass. Lamp glass is parented to `lamp`.

---

## Material bill (preflight)

Working scene: `tools/blender/build_works_gas_tap.py` →
`assets/works/gas_tap/source/gas_tap_lod{0,1,2}.glb`.
`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.
G0–G7: Cycle 01 is `evidence_ready` only. G1/G2/G4 whole-asset remain open.

| Zone | Disp. | Base | Rough | Metal | Wear / why | Works light |
|---|---|---|---|---|---|---|
| Painted backplate / clamp shells | billed | `#2a2620` alkyd over steel | 0.58–0.78 | 0.04–0.14 | Chips to primer/steel at clamp lips and bolt bosses. Dirt in return flanges. | Dark bar against the pocket. Dielectric, not a light. |
| Valve body, yoke, pipes, wheel | billed | `#6d7075` → worn `#8b9096` | 0.28–0.50 | 0.72–0.90 | Machined faces, grease at stem, edge polish on rim. | Brightest metal; key finds the rim and yoke. |
| Brass / gold interfaces | billed | `#8a6b3a` restrained | 0.32–0.48 | 0.70–0.88 | Unions, bezel, packing nuts, stem nut. Not copper pipe. | Small warm catches, never a copper toy. |
| Rubber hose + armor | billed | `#3a3530` | 0.78–0.92 | 0.02–0.10 | Helical armor is steel-ish at the ridges; tube stays dielectric. | Dark run, supported. |
| Gauge face | billed | dry cream `#d8d0c4` | 0.62–0.78 | 0.00–0.04 | Printed ticks; dust film. Not emissive, not a sticker on the glass. | Readable disc from above. |
| Gauge glass / lamp glass | billed | `#161009`–`#2a241c` | 0.08–0.22 | 0.02–0.06 | Recessed. Dust. | Dark window; lamp glass is the only legal emissive. |
| Lamp hood | billed | painted steel | 0.55–0.70 | 0.10–0.20 | Hood cavity; emission lives inside. | Small mint/warm well, not a halo. |
| Rock-bolt heads | billed | bright steel | 0.30–0.42 | 0.80–0.92 | Only at clamp interfaces. | Specks on the plate corners. |

World: dark. Key `0xffdcbc` raking, real shadows. Rim `0x9db8f0` weak. Fill `0xd8c3a8` weak.
≈5:1 key:fill. Surfaces are designed for that amber, not a studio HDRI.

---

## Quality axes (grade these)

1. **Planform at 120 px/cell** — clamp bar + wheel + offset gauge + +X tap. Not a box-with-wheel.
2. **Clay vs textured** — those four shapes hold in `works_top_clay.png`.
3. **Edge standoff** — `works_edge.png` shows plate off the rock, brackets in depth.
4. **Site tap direction** — `works_site.png` still points +X. No outline, no glow.
5. **Manufacture** — hat-section plate, yoke-and-stem, C-rim wheel, recessed gauge, fitted hose.
6. **Material split** — paint / bare steel / brass / rubber / dry face / glass. No Rover yellow.
7. **Hooks** — wheel clears yoke; needle inside glass; lamp hooded. Axes as the table.

Cycle 01 weakest expected: hose armor vs triangle budget, and gauge ticks at 16 px — both are
later-cycle density, not a reason to ship a tank or a torus.
