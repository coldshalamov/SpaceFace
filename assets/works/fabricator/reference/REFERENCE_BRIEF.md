# Works fabricator — cycle 1 reference brief

**Asset:** `fabricator` (PQ-131.08). **Class:** place/prop, works camera only. **Tier:** C
(supporting machine; one manufactured family). **State:** `design_candidate`. Cycle 1 of ≥5.
This page is the construction contract for the source candidate. It does **not** import
geometry or textures.

Supported cameras: `works_top` (120 px/cell), `works_edge` (same camera, object offset to
the frame edge), `works_site` (19 px/cell). All 1920×1080, 31° perspective, +Z up, origin
at cell centre, base feet on z = 0. Never orthographic. No fog. No studio three-quarter.
Owner: `tools/blender/spaceface_works_camera.py`, matching live
`src/ui/asteroid/asteroidRenderer3d.js`.

Stand-in to replace (not copy): the sealed bay + glowing viewport + floating box-head in
`src/render/asteroidInteriorPreview.js` (`kind === 'fabricator'`). That read is a crate
with a lamp and a printer toy on the lid. Inventory row
(`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md` §4 `.08`): *“A gantry head travelling a
rail over a work bed; head position is progress.”* 1 cell. Hooks: `gantry_head` (0–1 along
`rail`), `lamp`. Budget 10k / 2.5k / 800 · 1024².

---

## 1. Cited authorities (local)

| Claim | Source |
|---|---|
| One-cell machine; gantry head position **is** progress | Campaign inventory `.08`; live `dyn.progressBar` / `progressTravel` / `progressBase` in `asteroidRenderer3d.js` (head `position.x = base + travel * p`) |
| Discrete recipes, not a continuous furnace | `src/data/sites.js`: Cast Regocrete 45 s, Print Electronics 60 s, Assemble Courier Pod 90 s |
| Machines are dark metal with **one** lamp; rover yellow is reserved | Design law §4 (`design/ASTEROID_WORKS_DESIGN_LAW.md`); campaign §4 surface pass |
| Congruous 3D, no emissive outline, no cartoon pad | Design law §2.7 |
| Works camera law, 2.2 wu cell, 120 / 19 px | Campaign §2; `spaceface_works_camera.py` |
| Open work, not a glowing window | Palette comment on `sm_fabricator` and interior-preview note: viewport is a knockout, never a glowing panel — this candidate goes further and **drops the enclosure** |
| Material-truth preflight, no DCC default identity | `.grok/skills/spaceface-blender-material-truth/SKILL.md`; `VISUAL_ASSET_PRODUCTION_STANDARD.md` |
| Place MTX set | `ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` class *Place / rock / station module* |

---

## 2. Cited industrial families (ART EXTRAPOLATION)

These are construction references, not donors. No mesh, texture, or CAD is imported.

**Cartesian gantry (bridge mill / compact CNC).** Two parallel linear guides rooted to a
base, a bridge spanning them, a carriage on the bridge, the tool hanging into open volume.
Desktop and compact industrial examples (Shapeoko / X-Carve / Nomad class; also small
bridge mills) share the same load path: tool → ram → carriage → bridge → bearing blocks →
profile rails → side frames → base. The planform from above is a bright rectangle of bed
with a dark H (two side rails + a travelling bridge). That H is the silhouette this asset
must hold at 120 px and still suggest at 19 px.

**Profile linear rail + recirculating-ball block (THK HSR / Hiwin HG family).** The rail
is a drawn, ground, induction-hardened raceway with a reference edge, not a round rod and
not a box. The block is a short saddle with end seals, grease path, and a top flange that
bolts to the bridge. Four-row contact is the industrial default; we model the **visible**
block: body, two end-seal faces, a lip that wraps the rail, flange fasteners. A cylinder
on a stick is the printer-toy fake.

**Open fixture bed with T-slots.** Machine tables (aluminum T-slot plates, cast iron mill
tables) carry inverted-T channels for T-nuts, toe clamps, and bushings. The bed is the
brightest large surface because it is worn, scraped, and kept clear of paint. Waste leaves
through edge gutters / chip pans — negative space, not a lip painted dark. A flat table
with a grid texture is the named failure.

**Multi-process tool head.** The recipes are cast / print / assemble, so the head is not a
single FDM nozzle. Industrial cousins: hybrid mill-additive heads (spindle + deposition
nozzle on one ram), benchtop mill spindles with ER collets, ceramic heat shrouds around
hot tools. One ram, two process cues (spindle + nozzle), a shroud, a saddle that actually
clamps the bridge.

**Energy chain (Igus E-chain class).** Hinged polymer links in a guide trough, both ends
bracketed — one end to the drive/column, one end to the travelling carriage. Cables live
*inside* the chain. A floating noodle, a painted stripe, or a cable parented to the head
as a rigid stick is the fake.

**Hooded task lamp.** A real can with a hood and a recessed glass, aimed at the bed. One.
Restrained. Not a glowing window, not an outline, not rover yellow.

Forbidden reads, named so they cannot sneak back: printer toy, altar, crate, glowing box,
flat table, floating nozzle, rover yellow, generic UV grid, plastic chrome, glowing window,
floating cable, repeated-box greebles, billboard, emissive silhouette.

---

## 3. Fiction (ART EXTRAPOLATION unless noted)

A **one-cell Helix/MTS pattern fabricator** bolted to a bored gallery floor. Canon: Helix
Directorate + MTS ore trade; this exact cell is extrapolated. It casts regocrete blanks,
prints control electronics, and assembles courier pods (`sites.js` recipes). It is field
equipment, not a laboratory printer and not a station shipyard.

Crewed from the gallery floor: the operator sees the bed, the clamps, and the head. There
is no sealed viewport because there is no box to look through.

| Assembly | Manufacture |
|---|---|
| Base, side frames, bridge paint | Folded 4–5 mm steel plate, welded C / box sections, zinc primer, dark alkyd (`#2a241c` family). Chips to metal at feet, gussets, rail seats. |
| Fixture bed | Ground aluminum/steel plate, unpainted on the working face. T-slots machined. Wear to bright metal on clamp pads and slot lips. Coolant stain in gutters. |
| Profile rails + bearing blocks | Induction-hardened bearing steel, ground races, bare. End seals polymer. Grease dark at block lips. |
| Drive / limits | Cast motor housing at −X, belt/ballscrew along +Y rail, limit flags at both ends. |
| Tool ram | Machined aluminum saddle + steel spindle cartridge. Dry alumina ceramic shroud and nozzle tip. |
| Energy chain | Injection-moulded polymer links, dark gray-brown, in a guide trough on the +Y side. |
| Lamp | Stamped steel hood, warm glass recessed, one fixture on the +Y frame. |
| Fasteners | Hex heads modelled at interfaces that read at 120 px (~0.03 wu), not texture studs. |

---

## 4. Silhouette from directly above (the only view that matters)

Five shapes a person resolves at ~264 px (one 2.2 wu cell at 120 px/cell). If the outline
is a rounded rectangle with a bar on top, the asset has failed.

1. **Bright open bed** — worn metal rectangle with real T-slot trenches and dark clamp
   masses. The brightest large field. Not a lid. Not a grid sticker.
2. **Two dark side frames** — rooted at ±Y, running the travel axis, carrying the rails.
   Darker than the bed. They are the H’s uprights.
3. **Dark bridge** — a beam spanning Y, sitting on two bearing blocks. It is a load path,
   not a roof. Negative space over the bed on both sides of the beam.
4. **Tool head** — a manufactured ram hanging off the bridge: spindle shroud + side nozzle,
   readable as a tool, not a cube. Authored at progress 0 (−X, the drive end).
5. **One hooded lamp** — small, on the +Y frame, aimed in. The only legal emissive.

Darker gantry / brighter bed is the site-register read (19 px/cell). Do not inflate the
silhouette with a halo, a roof, or an enclosure.

---

## 5. Proportions (committed)

1 cell = 2.2 wu. Envelope **≤ 2.08 × 2.08 × 0.90 wu** (margin inside the cell). Origin at
cell centre. +X = travel / drive-to-far. +Y = lamp / chain side. +Z = up. Base feet on
z = 0.

| Part | wu |
|---|---|
| Envelope L × W × H | ≤ 2.08 × 2.08 × 0.90 |
| Bed working face | 1.24 × 1.00, top z = 0.22 |
| Side-frame outer Y | ±0.98 |
| Profile rail centres Y | ±0.86 |
| Bridge beam | spans Y, section ≈ 0.16 × 0.13, centre z ≈ 0.70 |
| Travel line | +X, length 1.40, from x = −0.70 (progress 0) to x = +0.70 (progress 1), y = 0, z = 0.70 |
| Tool clearance over bed | ≥ 0.10 wu of empty air |
| Lamp hood | +Y frame, z ≈ 0.82 |

Rest pose is progress 0. Extended travel is runtime; the exported bbox includes the head
at 0 and the full static frame.

Hooks (exact names): `gantry_head`, `lamp`. Exact node `rail` documents the travel line
(not a mesh the runtime must hide). Root node: `SF_WORKS_FABRICATOR_V1`. LOD roots:
`LOD0_fabricator`, `LOD1_fabricator`, `LOD2_fabricator`.

`gantry_head` owns the complete moving carriage/tool (bearing blocks, bridge, ram, spindle,
shroud, nozzle). Authored at local translation (0,0,0) relative to the hook, which sits at
world (−0.70, 0, 0.70). Local 0–1 travel is `+X * 1.40` (Blender / glTF X after Y-up
export). The energy chain **stays rooted** in its trough; it is not parented to the head.

---

## 6. Material bill (preflight)

`componentReferenceDecision`: `not_needed` — cited industrial families above; no generated
or imported image is used as a quality target this cycle.

`allSupportedViewZonesClassified`: **false** until an independent reviewer confirms
coverage. Working scene: `tools/blender/build_works_fabricator.py`. G0–G7: cycle 1 is
`evidence_ready` only. G1/G2/G4 whole-asset remain open. This packet does not wire, release,
or mark PQ-131.08 complete.

| Zone | Disp. | Base | Rough | Metal | Wear / why | Works light |
|---|---|---|---|---|---|---|
| Painted frame (base, sides, bridge paint, lamp hood) | billed | `#2a241c` dielectric alkyd | 0.48–0.68 | 0.06–0.16 | Chips to steel at feet, gussets, rail seats | Dark mass; key rakes bevels |
| Worn bed / fixtures | billed | `#9a9080`–`#c4b8a4` bare plate | 0.32–0.55 | 0.55–0.82 | Slot lips and clamp pads burnished; gutters stained | Brightest large field from above |
| Bare rail / bearing steel | billed | `#b8bec4` ground steel | 0.18–0.36 | 0.78–0.92 | Directional grind along +X; grease at block lips | Thin bright lines on the H |
| Dry tool ceramic | billed | `#c4b39a` alumina | 0.62–0.82 | 0.00–0.06 | Dry, dusty, no chrome | Matte tan on the ram |
| Cable-chain polymer | billed | `#3a3530` dielectric | 0.55–0.72 | 0.02–0.08 | Hinge dirt | Dark articulated strip in the +Y trough |
| Lamp glass | billed | warm dielectric | 0.18–0.32 | 0.02–0.05 | Recessed in the hood | The only legal emissive |

World: dark. Key `0xffdcbc` raking, real shadows, cool rim, weak fill. ≈5:1 key:fill on
the pad. Surfaces are designed for that amber rake: bevels must exist, cavities must be
real, paint must stay dielectric.

Shape-grammar failure of the stand-in: **sealed box + glowing pane + floating cube head**.
Replacement sequence: open bed with T-slots and waste gutters, two rooted C-section side
frames, profile rails with real blocks, a box-section bridge, a multi-process ram, a
rooted energy chain, one hooded lamp. Clay must read the five planform shapes without
textures.

---

## 7. Quality axes (grade these, not taste)

1. **Planform at 120 px/cell** — bright bed + dark H + hanging tool, not a crate.
2. **Clay vs textured** — form holds in `works_top_clay.png`.
3. **Travel** — head at 0 / 0.5 / 1 is collision-free, rooted, along `rail`; chain does
   not fly.
4. **Manufacture** — T-slots, bearing blocks, C-sections, fasteners; no primitive stack.
5. **Works light** — raking amber finds bevels; no emissive outline; lamp is a lamp.
6. **Hooks / envelope / LOD** — `gantry_head`, `lamp`, `rail`; bbox inside 2.2 cell; LOD1
   and LOD2 are authored reductions, not collapse-decimate.
7. **Material split** — six billed substances, not one sheet tinted six times.

Cycle 1 weakest expected: chain deformation across progress (posed as a full-length
trough run, not a stretching loop) and site-register tool-head density — both are cycle-2
material, not a reason to close the cell into a box now.
