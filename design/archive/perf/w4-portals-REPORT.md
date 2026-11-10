# Wave-4 Lane Report — Portals / PVS for Interiors

Lane question: *can cell-based visibility culling (portals / potentially-visible-sets) remove
per-frame work inside authored station/interior spaces?*

Branch: `devin/1790652879-w4-portals` off `origin/master` (9a30ffc00).

## Verdict

**PVS degenerates: every shipped "interior" is a single open room, so the camera-cell →
visible-set graph has exactly one node and nothing to cull.** The `place_dock_interior`
hangar is one walled bay open toward its mouth; the camera sits outside the mouth and never
enters a room. There is no multi-room interior in shipping content — the station "bar" is a
DOM screen (`src/ui/station/screens/bar.js`), and `asteroidInteriorPreview.js` is a dev-only
look lab behind `?dev=astlab`.

While auditing, the real per-frame dead work on the interior path surfaced instead: every
authored stage (berth / title-field / arena-foundry) re-rasterizes its 1024² shadow depth map
**every frame** over provably static casters — the hull and props are placed once at admission,
the light never moves, and camera drift does not enter light-space depth. This lane patches
that with a one-line-in-effect latch (`shadow.autoUpdate = false` on authored-stage key lights,
armed to bake once during the pre-reveal warm-up render): **−32 draw calls / −44,932 tris per
frame** measured on the title-field stage, ~15% of stage submit calls, ~23% of stage tris.

## Research citations

- **Luebke & Georges, "Portals and Mirrors: Simple, Fast Evaluation of Potentially Visible
  Sets"** (https://luebke.us/publications/pdf/portals.pdf) — screen-space portal stencils;
  the frame-to-frame cell coherence argument for why interior PVS amortizes.
- **Seth Teller, 1992 dissertation** (UC Berkeley) — the original portal/cell PVS formalism:
  a cell adjacency graph + antipenumbrae gives bitvector PVS per cell.
- **Abrash, *Graphics Programming Black Book* ch. 64/70 (Quake post-mortem)** — Quake's `vis`
  tool runs the PVS bake *offline*: portal sequences on the BSP leaf graph, output bitvector
  per leaf. The lesson for this lane: PVS pays when cells are numerous and occlusion is deep.
- **30fps.net PVS/portals primer** — practical summary: cell-graph culling needs ≥2 cells with
  meaningful mutual occlusion; a one-room cell graph is a no-op by definition.
- **Fernández, *Core Techniques and Algorithms in Game Programming* (2003)** — cells/portals
  as an undirected scene graph; portals become edges; visibility = graph reachability.
- **ACM 10.1145/1063723.1063732 (dynamic occlusion culling / relaxed PVS)** — runtime
  re-computation only earns its keep when the cell graph is non-trivial.

## Interior structure audit

Forge emits **material-merged meshes, not per-room prims** — each `place_*` GLB is already
collapsed to material-role groups (`LOD0_*` names) at export:

| Asset | prims | tris | structure |
|---|---|---|---|
| `place_dock_interior` | 12 | 11,128 | ONE open bay (26×18), walls back+right, open mouth |
| `place_dock_interior` grit | 13 | 13,784 | variant dressing, same single room |
| `place_dock_interior` military | 15 | 13,140 | same |
| `place_maintenance_gantry` | 22 | 13,166 | exterior gantry |
| `place_container_rack` | 37 | 24,743 | exterior rack |
| `place_improvised_dock` | 31 | 5,109 | exterior |
| `place_station_trade_hub` | 45 | 133,207 | exterior hub |
| `place_station_military` | 39 | 79,861 | exterior hull |

`tools/blender/forge/dock_interior_kit.py` builds ~100 authored prims per variant
(`_deck`/`_back_wall`/`_right_wall`/`_gantry`/`_front_trim`/`_variant_dressing`) and merges
them — the forge pipeline *can* group by authored prim, but the authored geometry itself has
one room. Runtime side, `uiStage.js` mounts them on authored stills; the berth scene
(`SCENES.berth`, camera `[-30,7,58]` target `[2,0,-8]` fov 38) composes
dock interior (fit 120) + gantry (fit 26, casts) + rack (fit 11) + hull. There is **no
camera-inside-interior culling today** — and nothing to apply it to: even with per-room prims
the cell graph is a single node.

## Cost measured

Static per-frame census inside the berth interior: **94 main draws** (dock 12 + gantry 22 +
rack 37 + hull 21 + sky 1 + stars 1), ~82.5k tris; **+43 shadow depth draws** (~46.6k tris,
hull 21 + gantry 22 casters) re-rasterized every frame.

Live A/B (`__THREE_GAME_DIAGNOSTICS__` per-frame census on the `title-field` stage — same
`drawStage`/`buildLights` path as berth; probe: `scratch-w4-portals-probe.mjs`, CDP-attached,
24 frames each side):

| | calls/frame | tris/frame |
|---|---|---|
| baseline (stashed) | 215 | 198,706 |
| latched | 183 | 153,774 |
| **Δ** | **−32 (−14.9%)** | **−44,932 (−22.6%)** |

Δ ≈ kestrel hull (21 prims / 33,460 tris) + `place_asteroid_rock_a` (13 / 12,072) minus ~2
prims frustum-culled out of the light's ortho — the shadow pass accounted for exactly.

## Patch — `src/render/uiStage.js` (+9/−2)

1. `buildLights`: for authored (non-live) scenes, `key.shadow.autoUpdate = false` — three r184
   skips that light's depth map after one bake (vendored `vendor/three.module.js` gate at
   ~line 9393; `needsUpdate` auto-resets at ~9597).
2. Rig returns `shadowLight` so the admission path can arm it.
3. `prepareForFirstDraw` warm-up block: `shadowLight.shadow.needsUpdate = true` before the
   single pre-reveal render — this is the moment all casters exist, so the one legal bake is
   identical to the first pre-patch bake.

Same-output argument: depth-map content = pure function of (light transform, caster
transforms); both are fixed for authored stages (light set at `buildLights`, casters
transformed once at admission, `applyCamera` only moves the camera — light-space invariant).
Pre-warm-up frames bind `emptyShadowTexture` (vendored patch) = all-lit, matching pre-patch
empty-map frames. Live-owned scenes (`title-attract`, `crucible-killcam`, `live: true`) keep
`autoUpdate` at default — their content animates. This is a leaf-grammar signature gate
(edge-triggered bake keyed to a frozen input signature), *not* interior-triangle culling —
the forbidden-list item.

## Golden

`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect
test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600`
→ `sha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` (identical,
repeat 20, deterministic: true). `node --test test/title-field-hardware.test.mjs` → 5/5.

## Pipeline change needed for real PVS (documented per lane step 3)

If a genuinely multi-room interior is ever authored: (a) forge emits per-room prim groups
(named `ROOM_<id>` meshes, not material-merged) plus a `rooms.json` adjacency sidecar —
room→portal→room graph; (b) `uiStage`/world loader registers room groups on a cell index;
(c) renderUpdate maps camera cell → visible-set bitvector and toggles `mesh.visible` per room
— a renderer-level leaf (visibility flags, no sim state, zero golden-hash exposure). Until such
an interior exists the machinery would be all cost, no cut: **PVS — WORTHLESS at current
content; keep the shadow latch instead.**
