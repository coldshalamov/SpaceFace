---
name: forge-graphics
description: Build, review, publish or fix any 3D body in SpaceFace (ship, station, prop, landmark) with the Forge kit, or regenerate the interface art derived from the models. Use for "make the graphics better", "this model looks cheap/wrong", new ships/places, graphics backlog rows (GFX-n).
---

# Forge graphics: how to do 3D work in SpaceFace

Read first:
- `tools/blender/forge/FORGE.md` for the look bar and the kit API.
- `design/program/GRAPHICS_PROGRAM.md` for workflows, rules, budgets and the backlog (`build_map.md` §13D Wave GFX).

Pick the top backlog row whose files are free.

## The loop (every body, no exceptions)

1. **Design on paper.** Settle these before coding:
   - a five-word idea;
   - the plan silhouette (the camera is a 60° top-down chase);
   - three values (light paint, mid secondary, dark machinery);
   - one identity colour carried in `band()`s;
   - where the lights are.
2. Write `tools/blender/forge/ships/<id>.py`. Copy the structure of a finished file:
   - ships: `hornet.py`, `kestrel.py`
   - big ships: `warden.py`, `leviathan.py`
   - places: `place_cargo_pod_standard.py`
   - stations: `place_station_refinery.py`, `place_station_fab.py` (their local `truss`/`cluster` helpers are worth copying)
   - landmarks: `place_landmark_*.py`
3. Preview: `blender -b --python tools/blender/forge/ships/<id>.py 2>&1 | grep -E "forge\]|Error|Trace"`
4. Render through the live renderer:
   `node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --name=<id> --views=inspect,close,top --out=.devshots/forge-<id>`
   Then **open the PNGs with Read**. `close` is the chase camera at close zoom and is the picture that matters for ships; `inspect` and `top` matter for places.
5. Critique like an art director:
   - floating parts;
   - clipped or z-fighting stripes;
   - blown or muddy values;
   - an unreadable silhouette;
   - too plain or too busy;
   - "a toy block".
   Fix everything and re-render. Do three cycles minimum; stations take 4–5.
6. Publish: `node tools/blender/forge/publish.mjs <id>`. It handles the manifest, the release (KTX2 + meshopt), all render packages and the census.
7. Check, then commit with pathspecs. The checks are listed in `GRAPHICS_PROGRAM.md` §2.5.

## Hard-won facts (each cost hours; do not relearn them)

**Colour and look**
- **Colour calibration:** the Helios key light lifts values about 2.5×. Author paint at hex channels ≈ 0x30–0x90; `#a69d8a` ivory is the brightest allowed; dark armour is 0x20–0x2c. Anything you think looks right in Blender will be pastel in game.
- **No noise, ever.** Broadband roughness/normal noise at this camera reads as leather or hammered tin. The shared panel tile (seams, fasteners) supplies the surface. Wear is modelled geometry (a patched plate), not texture.
- **Lights sell scale.** Hundreds of small lit windows, nav red (port, +Y) and green (starboard), an amber beacon. A station without lit windows reads as a toy.
- **Nothing floats.** Every module joins by a truss, arm, spoke, pylon or strut. The chase camera finds every gap.

**Kit mechanics**
- **Blender axes:** +X nose, +Y port, +Z up. glTF is (x, z, −y). Blender (x, y, z) = glTF (X, −Z, Y).
- **Finish variants:** `'paint.rust': '#4a2818'` in COLORS, then `material='paint.rust'`. Glows work the same way (`'glow_cyan.magenta'`). A place must also use the base `paint` somewhere, or the station check fails with "no semantic Material_Hull".
- **`band()` cuts the part's geometry.** Inset bands on heavily bevelled parts explode the triangle count (a rack went 35k → 16k by dropping the inset). `band()` slices the whole part; confine a band to a region by building a separate collar part.
- **`work_lamp()` glows on its back cap too.** Aimed-down lamps show only their backs to a top-down camera. Use a matte can, a visor and a lit halo ring the camera can see.
- **Tall vertical places read as slivers from the top.** Spread the plan unless the live sockets require height.

**Contracts and budgets**
- **Budgets (LOD0 triangles):** ships 10–45k, props ≈15k, stations 30–70k (trade hub up to 90k), landmarks 40–100k. LOD1 ≈ 40%, LOD2 ≈ 18%. Mark greebles with `s.detail = 1`.
- **Gameplay contracts:**
  - Places copy the live file's sockets automatically (`export_place`). Keep the structure inside the live bounding box so the sockets land on it.
  - Ships pin their sockets in source when the contract matters (see `kestrel.py`, `massline_express_liner.py`).
  - When master repairs a socket, carry it into the Forge source.
- **Brand-new place:**
  - Add a `fleet.json` entry with `new_place: true` and set `s.socket_names` and `s.socket(...)`.
  - Register it: parts-manifest row (copy a place row), `runtimeSlots.place`, `PLACE_FILES` in `src/render/partsLibrary.js`, and a pilot in `assets/ships/render-packages/pilots.json`.
  - **Release every new place before any full package rebuild.** A pilot without a release row breaks the rebuild for everyone. Run the blender `--live` exports, then `check-parts-manifest --sync`, then `build-sg04-release-assets --only ids`, then refresh the pilots, then rebuild all packages, then the census.
- **Draw size of a POI place:** `placeTargetRadius` sets the drawn radius and outranks the census ratio. `visualRadius` is the gameplay footprint; keep it at 20–60.

**Generated files and merges**
- **Every render package embeds the `pilots.json` hash.** Any pilot edit makes all packages stale, so rebuild all of them (`node scripts/build-render-package-pilots.mjs`). publish.mjs does this.
- **The census must equal a fresh run** (`node scripts/model-truth-census.mjs`). Commit the whole file and never splice rows. Splicing on HEAD lost 42 rows once.
- **Merging master:** resolve generated files (release manifest, pilots, packages, `renderPackageManifest.js`, census) by picking the side whose recorded SHA matches the bytes on disk; then rebuild all packages and the census. Take your side for Forge GLBs.

**Render rigs and machine**
- **SwiftShader rigs:**
  - `fleet-look` needs `renderer.compile` before shooting and a camera re-pose per frame. It re-shoots blank frames.
  - `flight-look` must call `resumeAuthoredUpgradeQueueAfterOpening` or the ship stays a resolving marker.
  - Chromium lives at `/opt/pw-browsers/chromium`.
  - EEVEE needs EGL; use Cycles (Freestyle works with Cycles).
- **Load:** three render-heavy agents is the ceiling on a 4-core VM. Renders take 2–10 minutes each. Never run two renders of the same body at once.
- **Blender cannot import meshopt release GLBs.** Import the source GLB under `assets/ships/parts/`.

**Ownership**
- **Ownership:** `src/ui/**` belongs to the ORRERY frontend lane (AGENTS.md). Model-derived data (`src/data/shipSilhouettes.js`) and poster images are graphics; the poster *table* (`src/ui/hullPosters.js`) is theirs.

## After a player hull changes

```
blender -b --python tools/blender/forge/silhouettes.py | grep SILHOUETTES_JSON   # paste into src/data/shipSilhouettes.js
node tools/art/render_hull_posters.mjs ship_<id>                                    # posters + manifest marks
node --test test/hull-integrity.test.mjs test/j07-hud-contract.test.mjs
```

## Running agents in parallel

Use the templates in `tools/blender/forge/briefs/`. Agents own only their `ships/<id>.py` file. They never touch the kit, the exporter, `fleet.json`, `src/`, manifests, publish or git. The lead reviews each report's PNGs, publishes and commits in pathspec packets. It also pushes after every packet so no work is stranded on the VM.
