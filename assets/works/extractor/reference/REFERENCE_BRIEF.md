# Works extractor — Cycle 01 reference brief

**Asset:** `place_works_extractor` (PQ-131.03). **Class:** place/prop, works camera only.
**Tier:** B (signature mine machine). **State:** `design_candidate`. Cycle 1 of ≥5.
This page is the construction contract. It does not close G1/G2/G4.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same camera, object offset to the
frame edge), `works_site` (19 px/cell). All 1920×1080 or larger, 31° perspective, +Z up in
Blender, origin at cell centre, underside at z = 0. Never orthographic. No fog. No studio
three-quarter.

Stand-in to beat, not to copy: the procedural boxed gearcase + cylinder rod + five fin slabs
in `src/render/asteroidInteriorPreview.js` (`kind === 'extractor'`). That read is a crate with
a stick. The authored machine must be named as an extractor in under a second from straight
down.

---

## Local paths cited before form (do not copy geometry or textures)

Shape-only kit references — inspect massing, then author original parts:

1. `assets/incubator/everyday_space_kit/source/drill_platform.glb`
   — ring deck + bit/collar facing a seam; keep “tool points at the work,” reject the 24 m
   outrigger tower and ochre house.
2. `assets/incubator/everyday_space_kit/source/conveyor_truss.glb`
   — belt span, idler, drive house; keep trough + roller + drive, reject the 24 m truss and
   bucket flight.
3. `assets/incubator/everyday_space_kit/source/crusher_module.glb`
   — hopper mouth, armored cheeks, motor; keep a real crushing aperture, reject the 7×5 box
   body and donor materials.

Construction studies (generated, component/planform only — frozen identity is the numbers
below, not the pixels):

4. `assets/works/extractor/reference/ref_01_overhead_extractor.png`
5. `assets/works/extractor/reference/ref_02_crusher_head.png`
6. `assets/works/extractor/reference/ref_03_conveyor_stub.png`
7. `assets/works/extractor/reference/CONTACT_SHEET.png`

`componentReferenceDecision`: `native_imagegen`. Kit GLBs are cited shape references only.
Do not import, join, retarget, or bake from them.

### Selected traits (from the studies)

- U-shaped floor frame of C-channel rails and crossmembers, **open on the feed side**.
- Rectangular crushing/intake mouth facing the feed, teeth on the rim, dark well inside.
- Horizontal-axis drum in a yoke with circular bearing housings rooted in saddles.
- Short belt between side walls, sag/rollers, negative space under the belt, inboard drive.
- Heat-sink fins **rooted** into a heat-stained drive case, not occupancy wings.
- One hooded lamp with a tiny lens; fixture exists with emission off.

### Rejected traits (do not build)

- Long floating hose from lamp to nowhere (ref_01).
- Red lamp-can as identity colour (ref_02); hood is dark painted metal, lens is warm glass.
- Safety yellow anywhere (rover-only livery).
- Closed crate, turret on a pintle, forklift forks, gun barrel, box-plus-cylinder.
- Occupancy fins that widen the cell footprint.
- Kit meshes, kit UVs, kit textures, generic plate-grid, neon, leather, billboards.

---

## Fiction (ART EXTRAPOLATION unless noted)

A **one-face gallery extractor** bolted to a bored cell floor. Law: machines feed through
faces; this unit works **one adjacent cell** on +X. Sold as a Helix/MTS face mill to claim
crews (canon: Helix Directorate + MTS ore trade; this pattern is extrapolated). It is a
load-bearing floor machine, not a vehicle and not a weapon.

| Assembly | Manufacture |
|---|---|
| Floor rails / crossmembers / trough walls | Folded 4–6 mm steel C-channel and hat beam, welded, then dark alkyd over zinc primer. |
| Yoke / bearing housings / drum | Cast and machined steel, oxide, grease at the races. Drum is tool steel, rock-polished. |
| Jaw / rim teeth / chute liners | Dry ceramic wear tiles, bolted, tan-gray, chipped at the bite. |
| Belt | Rubber-composite carcass on steel rollers; UV-scroll mesh is the outer belt face. |
| Drive case / fins | Heat-stained steel gearbox; fins are rooted plate in a header, not stuck cards. |
| Lamp | Cast hood, ceramic socket, small warm glass lens. Recessed emission only. |
| Service accent | One restrained warm ochre handle / cover lip on the drive — not yellow, not neon. |

---

## Silhouette from directly above (the only view that matters)

Five shapes a person resolves at ~120×120 px. If the outline is a dark rectangle with a
cylinder on it, the asset has failed.

1. **Open +X feed** — the right side of the cell is a mouth, not a wall.
2. **Toothed intake** — a dark rectangular well with teeth on the rim; the facing cue.
3. **Belt trough** — two side walls and a darker ribbon running inboard from the mouth.
4. **Aft drive + fin comb** — a housing with rooted heat-sink fins, left of centre.
5. **U-frame** — two rails and an aft crossmember; lamp as a small hood on one rail.

---

## Proportions (committed)

1 cell = 2.2 wu. Footprint **inside** one cell. Origin at cell centre. +X feed / forward,
+Y port, +Z up. Underside on the cut face (z = 0).

| Part | wu |
|---|---|
| Envelope L × W × H | ≤ 2.10 × 1.70 × 0.92 |
| Rail centres Y | ±0.68 |
| Rail length along X | −0.90 → +0.55 (open beyond) |
| Mouth outer +X | +0.92 |
| Head_face pivot | (0.42, 0.00, 0.36) |
| Belt span X | −0.22 → +0.48 |
| Drive case centre | (−0.52, 0.00, 0.30) |
| Lamp | (0.34, 0.68, 0.50), hood opening +X |

Hooks (exact names) under root `SF_WORKS_EXTRACTOR_V1`: `head_face`, `belt`, `lamp`.
LOD roots: `LOD0_extractor`, `LOD1_extractor`, `LOD2_extractor`.
`head_face` local +X is the aim axis (world +X at rest). `belt` owns the scrollable belt
and roller surfaces. `lamp` owns hood / lens / socket.

Budget: LOD0 ≤ 8,000 tris · LOD1 ≤ 2,000 · LOD2 ≤ 600. Textures 1024² basecolor / normal /
ORM, unique non-overlapping UV0.

---

## Material bill (preflight)

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms coverage.

| Zone | Disp. | Base | Rough | Metal | Wear / why |
|---|---|---|---|---|---|
| Painted structure (rails, walls, yoke, hood) | billed | `#2a2620` dielectric | 0.50–0.68 | 0.06–0.14 | Dirt in C-channel; chips to primer on rail corners. |
| Cutting / roller metal | billed | `#8a8680` steel | 0.22–0.42 | 0.72–0.90 | Rock polish on drum and roller crowns; grease at ends. |
| Heat-stained drive | billed | `#6a4a32` → straw/blue | 0.34–0.52 | 0.62–0.82 | Heat from the gearbox; fins same family, cooler at tips. |
| Ceramic wear | billed | `#9a8c74` dry | 0.62–0.80 | 0.00–0.06 | Chips at the bite; no chrome, no plastic. |
| Belt carcass | billed | `#1c1a18` rubber | 0.78–0.90 | 0.02–0.08 | Abraded centreline; packed fines in the trough. |
| Lamp lens | billed | warm glass | 0.12–0.28 | 0.02 | Recessed; only legal emissive with the fixture. |
| Service accent | billed | `#8a5a2c` ochre dielectric | 0.48–0.62 | 0.08–0.14 | One handle / cover lip. Not rover yellow. |

Forbidden reads: plastic copper, generic grid/noise, universal edge wear, neon, flat decals,
leather, billboard parts, safety yellow, glowing bars, DCC default Principled.

World: dark. Key `0xffdcbc` raking, real shadows. Rim `0x9db8f0` weak. Fill `0xd8c3a8` weak.
≈5:1 key:fill. Designed for that light: bevels must exist, cavities must be real.

Working scene: `tools/blender/build_works_extractor.py` →
`assets/works/extractor/source/extractor_lod{0,1,2}.glb` and
`assets/ships/parts/works/place_works_extractor.glb`.
G0–G7: Cycle 01 is `evidence_ready` / `review_pending` only. G1/G2/G4 whole-asset remain open.
Do not self-launch reviewers.

---

## Quality axes (grade these)

1. **Planform at 120 px/cell** — five shapes, feed +X, not a crate or turret.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Mouth is a hole** — dark well with teeth, not a painted square.
4. **Belt is a machine** — walls, rollers, negative space, scrollable UV.
5. **Fins have a heat path** — rooted into the drive case.
6. **Lamp is a fixture** — hood/lens/socket; readable with emission off.
7. **Hooks / envelope / LOD** — 3/3 names; bbox inside the cell; LOD1/2 keep direction.

Cycle 01 weakest expected: tooth density vs 120 px, and site-register (19 px) identity as a
directional machine rather than a dark dot.
