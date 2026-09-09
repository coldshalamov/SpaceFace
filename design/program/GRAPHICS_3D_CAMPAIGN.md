<!-- LIFETIME: DURABLE -->
# 3D world-object campaign — same bar, chase camera, no hitch collision

Law for an agent doing **models in the world** while another thread owns hitch smoothness
(`PQ-129`). Copy-paste operator: [`GRAPHICS_3D_GOAL.txt`](./GRAPHICS_3D_GOAL.txt).

This is not INFERENCE. This is not `PQ-129`. This is not a quality-preset pass and not a
default-quality cut.

---

## 1. The bar (consistency over peak detail)

Variable quality is worse than a slightly softer house style. A live Hitch / Helios
wholeship at the **60° chase camera** is the floor. A tube + ring next to that ship is a
defect even if the ship is unfinished.

**Pass:** at default chase (144 WU) a stranger can tell the object’s job (cargo, beacon,
drone, interceptor) and it looks manufactured — shell, wells, rims, mixed materials —
not a default cylinder/torus/box.

**Fail:** primitive stack; cabin furniture the chase camera cannot see; glued boxes whose
hidden faces still exist; N64 brick; shiny-for-shiny.

Hitch/Kestrel stays frozen. Do not dump Hitch down to match the tube.

Camera / chunk / imagen-or-Codex-handoff: [`docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md`](../../docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md).
Places and pods use the same chase stills (`play_chase`, `play_chase_abeam`,
`play_chase_close`). Seats are illegal here too.

---

## 2. Where the list of models lives

The packaged manifest is **not** the list of everything you see. Code-built
objects (cans, hoops, fallback stations, rocks, gates, drones, wrecks, mines)
live in [`WORLD_VISUAL_CENSUS.md`](./WORLD_VISUAL_CENSUS.md). That census is
the hole this campaign kept missing.

| List | What it is | Gap |
|---|---|---|
| [`WORLD_VISUAL_CENSUS.md`](./WORLD_VISUAL_CENSUS.md) | Live objects built from cylinders/boxes/hoops, plus “already a file — upgrade in place” | Must be updated when a new code-built prop ships |
| `assets/ships/release/release_manifest.json` | Packaged GLBs (~83 rows: hulls, places, pods, wholeships, kit parts) | A row is bytes on disk, not “looks accepted” |
| `src/render/partsLibrary.js` `PLACE_FILES` + `WHOLE_SHIP_*` | What the live game actually loads | Selectors can still be factory-ugly |
| `design/graphics-sprints/VISUAL_ASSET_CATALOG.md` | 2026-08-08 census of live vs candidate vs donor | Dated; does not include procedural meshes |

If it is in the world and it is a cylinder, it still counts, even with no GLB row.
Upgrade the existing object. Do not start a parallel prop.

---

## 3. Collision with the live hitch thread

Codex session `01a01de8-407a-7cc3-9dde-da32c034902a` (as of 2026-08-21) is on `PQ-129`:
shader-key census, unique GPU programs, bloom/HDR scene submit, `renderer.js` /
`precompile.js` / `partsLibrary.js` / `bloom.js` / `pipelineReadiness.js` /
`opaqueMaterialBatch.js` / `program-queue.json`.

**Stay off those files.** Also stay off `NOW.md`, `visualOverrides.js`,
`scenarioProps47a.js` (hitch work is counting 47-A program families), Hitch/Kestrel,
and any fleet-wide promote script.

**Safe while that thread is live:** Blender/GLB/source/evidence under `assets/` and
`tools/blender/`, plus this campaign’s docs. Same-slot GLB replace (same id, sockets,
collision, filename) plus the matching **manifest hash rows only** is allowed for
packaged places/pods. Do not add new runtime maps or new shader families.

**Wait until hitch work has stopped mutating** (no `NOW.md` row, no dirty renderer
owners, or the owner says it is done) before: swapping 47-A procedural builders to
GLBs, editing `partsLibrary.js`, quality presets, nebula bake, rock_b/c loader
changes, hidden-face **deletion** on live Hitch.

Author the 47-A spindle GLB **now** into a candidate folder. Do not hook it until
the hitch thread is done. That is the wait, not the modeling.

---

## 4. Ordered units (one at a time)

Keep going. Finish one, commit only that unit’s files, then the next.

| # | Unit | Why | Hitch-safe now? |
|---|---|---|---|
| **1** | Nav buoy + lane beacon (the repeating “satellite”) | Always in lanes; live GLBs; tube/ring | Yes — assets + manifest hashes |
| **2** | `pod_cargo_container` | Same silhouette class as the 47-A spindle; lives on haulers | Yes — assets + manifest hashes |
| **3** | 47-A evidence spindle **candidate GLB only** | The exact Payload/TOW tube in 47-A | Model yes; **do not** edit `scenarioProps47a.js` yet |
| **4** | Mining drone + conveyor barge | Old low-detail field props | Yes — assets + manifest hashes |
| **5** | Hornet chase-camera **skin + wells** in `fleet_player_bodies_v1/hornet/` | PQ-050.01; no seats; no all-fleet promote | Yes — do not recopy into `partsLibrary` maps until hitch is idle |
| **6** | After hitch idle: wire unit 3; then Drifter (`PQ-050.02`); then the next PQ-050 ship | Fleet remaster | Wire step waits |

Do not start quality presets, Worker/WebGPU, or Hitch polish in this campaign.

---

## 5. Performance while modeling

Hold `design/PERF_BUDGET.md`. Default bloom/shadows/particles stay on. Do not “optimize”
by making the new mesh a worse picture.

New bodies: one skin, holes cut in, join by material on export, few materials (about
the Hitch/Helios count, not 57 tiny pieces). Run
`tools/blender/chase_visible_faces.py --glb <export>` as a **dry-run report**. Do not
hand-delete faces. Do not add extra lights, extra program families, or DoubleSide on a
closed hull.

---

## 6. Proof for one unit

- Chase stills of the exported GLB: `play_chase`, `play_chase_abeam`, `play_chase_close`.
- Side-by-side with Hitch or a Helios wholeship at the same camera: the new object is
  the same *kind* of object, not a toy next to a ship.
- Sockets / collision / id unchanged if replacing a live slot.
- `npm run check:playable` after a live replace. A green check is not the still-frame test.
- If imagen is missing: Codex terminal handoff in `docs/visual-assets/AGENT_PROMPTS.md` § E,
  or use files already in that asset’s `reference/`.

RESULT: DONE for the campaign only when units 1–4 are on master and unit 5 has a
chase-camera Hornet candidate (wired or honestly unwired). Unit 3 may stay unwired if
hitch is still mutating `scenarioProps47a.js`.
