<!-- LIFETIME: DURABLE -->
# Asteroid Works art campaign — authored assets to the ship bar

**Why this file exists (owner, 2026-08-21, looking at the live build):** "some of these graphics are
terrible, some are 3d but then the rover is like this 8-bit NES model inside this 3d world … you're
intentionally cutting corners because making a model for this or that asset is too much work … I'd rather
you at least made plans for the future development to actually get the game that we want here instead
of making the shitty prototype version and calling it done."

That verdict is correct. `PQ-130` rebuilt the mine's *presentation* (sovereign board, real rock, chrome,
events, sound, build flow) but every **object** in the scene — rover, six machines, derrick, conduits, ore
and gas inclusions, crates, courier pod — is procedural low-poly geometry built in a renderer file. Next
to the flight game's authored PBR hulls it reads as a toy. **Procedural stand-ins are scaffolding, never
acceptance.** This campaign replaces every one of them with an authored asset through the same pipeline
that produced the flight ships, to the same bar, reviewed the same way.

Admitted as **`PQ-131`**. Operator prompt: [`ASTEROID_WORKS_ART_GOAL.txt`](./ASTEROID_WORKS_ART_GOAL.txt).
`PQ-130`'s acceptance is **blocked on this campaign** — its leaves `.03`, `.05` and `.10` are
`implemented` (code landed, stand-in art), not accepted.

---

## 1. The bar

The same bar as [`GRAPHICS_3D_CAMPAIGN.md`](./GRAPHICS_3D_CAMPAIGN.md): **Hitch / Helios wholeships at
play size.** Put the works still beside a flight still of a ship near an asteroid. If the mine's objects
look like they came from a different, cheaper game, the unit failed. No outlines, no emissive paint, no
glued boxes; one skin with real holes, authored surfaces, lamps that are lamps.

Law stack, all binding:
[`docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](../../docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md)
(form, unique UVs, mesh bakes, authored surfaces, LOD),
[`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](../../docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md)
(cycles; three independent reviews that list every defect at play size; revise; repeat),
[`FLYABLE_SHIP_WORKFLOW.md`](../../docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md) (chunking one asset,
reference first, hidden-face handling),
[`VISUAL_ASSET_PRODUCTION_STANDARD.md`](../../docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md),
and the design law §2.7 ([`ASTEROID_WORKS_DESIGN_LAW.md`](../ASTEROID_WORKS_DESIGN_LAW.md)).

## 2. The works camera (the only close camera for this campaign)

The mine is seen **straight down** through a 31° perspective camera, cells **2.2 world units** square,
**≈120 px per cell at 1920×1080** in the work register and **≈19 px per cell** in the site register.
Objects are read from above, and slightly from the side near the screen edges; their *tops* and
*silhouettes* are what a person sees. Every review still is taken with this camera, never a studio
three-quarter. Unit `.00` ships `tools/blender/spaceface_works_camera.py` (the sibling of
`spaceface_chase_camera.py`) with three framings: `works_top` (straight down, 120 px/cell),
`works_edge` (the same camera with the object near the screen edge, where side walls show), and
`works_site` (19 px/cell). A zoomed beauty crop does not count as proof.

## 3. Runtime prerequisite — authored assets must load in the works renderer (`.00`)

The works screen renders on its **own WebGL context** (`src/ui/asteroid/asteroidRenderer3d.js`). Release
assets are KTX2/BasisU + meshopt (`src/render/assetLoader.js`: `KTX2Loader`, `meshoptDecoder`, the basis
transcoder) and are admitted through `src/render/partsLibrary.js` and
`assets/ships/release/release_manifest.json`. `.00` gives the works renderer the same loading path: a
`KTX2Loader` bound to its renderer (`detectSupport`), the shared transcoder/decoder, manifest admission,
LOD selection by register (LOD0 at work, LOD1 at site), disposal on screen exit, and one seam —
`loadWorksPart(id)` — that the renderer calls for every object below. Until `.00` lands no authored asset
can ship in the mine; that is why the procedural stand-ins exist, and `.00` is how they stop.

## 4. Asset inventory (one unit each; this is the build order)

Every asset: **reference first** (imagen via the Codex terminal handoff in
`docs/visual-assets/AGENT_PROMPTS.md` § E, or an existing `reference/` folder), Blender blockout at works
scale, form pass, surface pass (unique UVs, bakes, authored PBR basecolor / normal / ORM), LOD0 + LOD1,
KTX2 release build via `scripts/build-hull-release-assets.mjs` (the canonical builder — **not**
`build_release_parts`), manifest entry, works-camera stills, three reviews, revise, wire. Scale is in
cells (1 cell = 2.2 wu). Hooks are named empties/nodes the runtime drives.

| Unit | Asset | What a person sees from above | Scale | Runtime hooks | Budget LOD0 / LOD1, textures |
|---|---|---|---|---|---|
| `.01` | **Rover** (hero) | A heavy tracked mining rig: two track units with visible tread, a low cab with a lit pane, a drill boom on a pivot ending in a steel bit, an open hopper on the back, safety-yellow panels with dark chevron plates, dark metal undercarriage, a hooded headlamp. The only safety-yellow object in the world. | 0.85 × 0.8 cell, ≈0.45 tall | `boom_pivot`, `bit_tip`, `hopper_fill_0..4` (five stages), `hopper_lid` (hinge), `lamp_socket`, `vent_stack`, `track_L`, `track_R` (UV scroll or plate chain), `scar_plate` | 18k / 4k · 2048² ×3 |
| `.02` | **Massline Core** | A squat machined anchor ring around a dark central well, heavy bolts, one small status lamp; "the thing that claims the rock" | 1 cell, ≈0.5 tall | `lamp`, `ring_spin` (slow) | 8k / 2k · 1024² |
| `.03` | **Extractor** | A compact drill head on a frame that faces its feed cell, a short conveyor stub, heat-sink fins, a lamp | 1 cell | `head_face` (aims at the contact), `lamp`, `belt` (UV scroll) | 8k / 2k · 1024² |
| `.04` | **Refinery** | A furnace block with a slit that glows warm while running, an exhaust stack, a pipe to a small tank | 1 cell | `furnace_slit` (emissive 0–1), `stack_vent`, `lamp` | 8k / 2k · 1024² |
| `.05` | **Surface derrick / head-frame** | A real head-frame over the shaft: A-frame legs, a drum with the umbilical, hooded work-lights, orange safety markings, a small platform — the place you came in | 1 cell footprint, ≈3 cells tall | `drum_spin`, `cable_anchor`, `lamp_L`, `lamp_R` | 12k / 3k · 2048² |
| `.06` | **Conduit kit** (cable + lane) | Modular straight / corner / T / cross / end-cap / junction-box pieces for two families: power cable (armoured tray, gold jacket) and material lane (translucent-topped tray with visible rollers). The renderer lays them along tunnel walls and floors from the network mask. | 1 cell per piece | `flow_mesh` (lane UV scroll / dot chain), `powered` emissive slot | 1–2k each · one 1024² atlas per family |
| `.07` | **Gas tap** | A valve manifold clamped to a wall face with a pressure gauge and a short hose into the pocket — tapping, not breaching | 1 cell | `valve_wheel` (spins when active), `gauge_needle`, `lamp` | 6k / 1.5k · 1024² |
| `.08` | **Fabricator** | A gantry head travelling a rail over a work bed; head position is progress | 1 cell | `gantry_head` (0–1 along `rail`), `lamp` | 10k / 2.5k · 1024² |
| `.09` | **Cargo port + crates + courier pod** | A loading frame with a launch cradle; a crate stack in five stages that fills as output accumulates; the courier pod that climbs the shaft | port 1 cell; pod 0.6 cell | `crate_0..4`, `cradle`, `pod_root`, `pod_thruster` (lamp) | 10k / 2.5k + 2k per crate stage + 4k pod · 1024² |
| `.10` | **Inclusion kit** (replaces the low-poly crystal clusters) | Ore cluster variants per family (silver, gold, iron, nickel), exotic lattice variants, an ice sheen plate, a gas crack decal set, the vented scar, the MK lock plate — authored, lit, occupying a real part of a cell | ≤0.7 cell | one instanced mesh per variant | 1–3k each · shared 2048² atlas |

Rover first — it is the character, it is the thing the owner named, and it proves `.00` end to end.

## 5. How a unit is built (one agent, one unit; Blender MCP or headless Blender)

1. **Reference sheet** — three reference images of real mining machinery of the kind (not sci-fi concept
   art) plus one works-camera screenshot of the current stand-in for scale.
2. **Blockout** at works scale in Blender (`tools/blender/` conventions; origin at cell centre, +Z up,
   footprint inside the cell), framed with `spaceface_works_camera.py works_top`.
3. **Form pass** — one skin with real holes; join by material; chamfers that read at 120 px; no glued
   boxes. `chase_visible_faces.py` adapted to the works camera: hidden faces are deleted, not shipped.
4. **Surface pass** — unique UVs, mesh bakes (AO, curvature), authored PBR textures; wear where a machine
   would wear; livery per the design law (§4 rover colours; machines dark metal with one lamp); **no
   emissive paint** beyond lamps and slits.
5. **LODs + release build** — LOD roots named `LOD0_*`/`LOD1_*`/`LOD2_*` (the loader tags LOD by node name, `assetLoader.js:1858`); release build through a canonical builder (works category in `scripts/build-place-release-assets.mjs`); manifest entry; **then** `node scripts/generate-render-package-pilots.mjs` and `node scripts/build-render-package-pilots.mjs` — a release part without a render package throws `AssetContractError` at load (`assetLoader.js:1184`); `check:render-package-coverage` green; hashes. Full list in `roadmap/active/PQ-131.md` "Release pipeline for a works asset".
6. **Wire** — the renderer swaps the procedural builder for `loadWorksPart(id)`; the named hooks drive
   the runtime state that already exists (hopper stages, bit heat, lamps, progress, flow).
7. **Proof** — works-camera stills at 120 px and 19 px per cell **beside a flight still**; three
   independent reviews listing every defect at play size; revise; repeat until the reviews say KEEP.
   `npm run check:asteroid-theater` and `npm run check:playable` stay green; no quality cuts.

## 6. Vanilla collapse (illegal here)

Scaling the procedural mesh; adding bevels to the box stack; another procedural "PBR hardware" pass; a
billboard sprite; an emissive outline; a studio render as proof; a GLB with no LOD1; skipping the three
reviews; marking `PQ-130` accepted before units `.00`–`.06` are on master.

## 7. Done

`PQ-131` is done when every row in §4 is an authored, reviewed, wired asset on master, the procedural
builders in `src/render/asteroidInteriorPreview.js` are deleted for those objects, and the owner, looking
at the live mine beside the flight game, does not see a different game.
