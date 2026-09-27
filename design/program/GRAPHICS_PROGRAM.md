# Graphics program: how the 3D picture is built, kept, and pushed further

Owner direction, 2026-09-27: one agent in charge of graphics rebuilt the fleet so every body belongs
to one game, and left a plan any agent can pick up. The kit and the look bar live in
[`tools/blender/forge/FORGE.md`](../../tools/blender/forge/FORGE.md). This page covers the
workflows around the kit, the rules that keep the picture consistent, and the ordered backlog.
The build-map entry is `build_map.md` §13D, Wave GFX.

## 1. State of the picture (2026-09-27)

| Area | State |
|---|---|
| Ships | **All 47 live bodies are Forge.** That covers the 14 player hulls (Kestrel/Hitch to Leviathan), the Ashline raiders, Helios civil traffic, the work fleet, the faction variants (Span dmc/mts/reach, Wasp free/mts/scn) and the Massline liner. Registry: `tools/blender/forge/fleet.json`. |
| Stations | **Forge:** refinery, mining rig, fab yard, military bastion, research array, black-market warren, jump gate. **In progress:** trade hub (`tools/blender/forge/ships/place_station_trade_hub.py`). |
| Props | **Forge:** cargo pod, lane beacon, nav buoy, mining drone, worklight tower, container rack, sensor mast. Everything else under `assets/ships/parts/places/` is still an older pipeline (see backlog GFX-3). |
| Landmarks | **In progress:** the Candle Fleet, the Resonant Cathedral and the Skerris Throne as new places (ledger D54). The Wreck Cathedral is an older pipeline. |
| Runtime look | Forge materials (`spacefaceFinish: forge-v1`) skip the rescue layers (roughness noise, palette multiplies, pigment). The procedural PBR fallback no longer stamps fine-grain relief on manufactured surfaces. |
| Interface art | HUD silhouettes are traced from the hulls (`tools/blender/forge/silhouettes.py`). Hero/side/top/holo/jig posters are rendered for all player hulls (`tools/art/render_hull_posters.mjs`). `src/ui/hullPosters.js` lists only the original four; enabling the rest is an ORRERY-lane change (GFX-5). |
| Size | Release wholeships 356 MB → 60 MB. Render packages 744 MB → 456 MB. One shared 1024 tile texture set instead of per-ship bakes. |

## 2. The workflows

### 2.1 Build, look, fix, publish (any body)

```
blender -b --python tools/blender/forge/ships/<id>.py        # preview → assets/ships/forge/preview/
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --name=<id> --views=inspect,close,top --out=.devshots/forge-<id>
#   open the PNGs; name every defect; fix; repeat (3+ cycles; stations 4–5)
node tools/blender/forge/publish.mjs <id>                    # live: manifest, release, package, census
```

Review is looking at the live renderer's picture, never a receipt. The `close` view is the chase
camera at close zoom and matters most for ships. For places, `inspect` and `top` matter most.

### 2.2 A brand-new place (no live body yet)

1. Add a `fleet.json` entry: `layout: 'place'`, `file`, `asset_id`, `part_id`, `new_place: true`.
2. In `build()`, declare `s.socket_names` and place each socket with `s.socket(...)`. The exporter
   writes them and stamps `category: places`.
3. Register the file with the game. This is manual today:
   - Add a parts-manifest row: copy a similar place row and change `id`/`file`; `check-parts-manifest --sync` fills bytes, tris and bounds.
   - Add it to `PLACE_FILES` in `src/render/partsLibrary.js`.
   - Add a render-package pilot (copy a place pilot entry in `assets/ships/render-packages/pilots.json`).
   - Run `publish.mjs <id>`.
   - Point the gameplay row at it (`landmarkGlb`, `placeScale` / `placeTargetRadius`).
4. Automating step 3 in `publish.mjs --new` is backlog item GFX-6.

### 2.3 After any player-hull change

```
blender -b --python tools/blender/forge/silhouettes.py | grep SILHOUETTES_JSON   # → src/data/shipSilhouettes.js
node tools/art/render_hull_posters.mjs ship_<id>                                    # posters + manifest marks
node --test test/hull-integrity.test.mjs test/j07-hud-contract.test.mjs
```

Stale interface art shows the player a ship that no longer exists.

### 2.4 Whole-fleet review (do this after any kit change)

- `node scripts/fleet-look.mjs --fleet` makes a contact sheet of every live body at chase and close zoom.
  Look for the odd one out: a value, a finish or a density that does not match its neighbours.
- `node scripts/flight-look.mjs --ship=ship_<id>` shows the real New Game flight.
- `node scripts/ui-bench.mjs --shot=station-shipworks` shows the refit jig with socket marks.

### 2.5 Checks after publishing

`node scripts/check-parts-manifest.mjs` · `node scripts/check-render-package-pilots.mjs` (fresh 267) ·
`node scripts/check-graphics-asset-receipts.mjs` · `node scripts/check-station-archetype-glb-load.mjs` ·
`node scripts/check-station-archetype-wiring.mjs` · `node test/model-truth-census.test.mjs` ·
`node --test test/render-package-pilots.test.mjs test/live-ship-visual-package-coverage.test.mjs`.

### 2.6 Merging with master (generated artifacts)

Release GLBs, `release_manifest.json`, `pilots.json`, render packages, `renderPackageManifest.js`
and `modelTruthCensus.json` are generated. On a conflict:

1. Resolve each row to the side whose recorded SHA matches the bytes now on disk.
2. Rebuild every render package (`node scripts/build-render-package-pilots.mjs`) so they embed the merged compiler.
3. Commit the census as a fresh run (`node scripts/model-truth-census.mjs`). The census test requires the whole file to equal a fresh run, so never splice rows.

A body master repaired (sockets, contracts) is carried into the Forge source, never dropped.

### 2.7 Running parallel agents

CPU is the constraint. Renders go through SwiftShader and take 2–10 minutes each. Three concurrent
agents is the practical ceiling on a 4-core VM.

Templates are in [`tools/blender/forge/briefs/`](../../tools/blender/forge/briefs/) (ships, places,
trade hub, landmarks). Each brief holds the look bar, the loop, the hard file-ownership rules
(agents never edit the kit, the exporter, `fleet.json`, `src/` or manifests, and never publish or
run git) and the report format. The lead reviews each report's renders, publishes and commits.
Inspect GLBs with `node tools/blender/forge/glbinfo.cjs <file>`.

## 3. The rules that keep it consistent

1. **One kit.** Every new or rebuilt body is made in Forge. A body from anywhere else is a defect until it is rebuilt.
2. **The look bar is FORGE.md §"The look".** It covers plan silhouette first, three values, identity colour in bands, layered construction, light as design, no noise, nothing floating and one idea per body. Calibrate paint for the Helios key light (about 2.5× lift).
3. **Runtime adds nothing to a forge body.** No bolted kit parts, no palette multiply, no roughness noise. What you model is what the player sees.
4. **Budgets:**

   | Body | LOD0 triangles | Notes |
   |---|---|---|
   | Ship | 10–45k | ≈10 draws; LOD1 ≈40%, LOD2 ≈18% |
   | Prop | ≈15k | |
   | Station | 30–70k | Trade hub up to 90k |
   | Landmark | 40–100k | |

   Performance comes from algorithms, sharing and culling, never from cutting authored detail.
5. **Gameplay contracts are sacred.** Sockets, hooks, collision scale and dock approach land where the live body had them. Copy them from the live file (`export_place`) or pin them in the source (the liner, the Kestrel).

## 4. Backlog (ordered by what the player sees first)

| # | Task | Why | Done when |
|---|---|---|---|
| **GFX-1** | Finish and publish the Forge trade hub; verify the three faction overlays (`var_station_trade_hub_{free,mts,scn}_overlay_v01`) sit on it. | It is the first and most-seen building in the game. | Overlay check renders show nothing floating; the receipts check passes on the forge stamp. |
| **GFX-2** | Finish the three hero landmarks, register them as new places (2.2) and point the POIs at them at landmark scale (Candle Fleet ≈ 90–110 WU, Resonant Cathedral ≈ 100–120, Skerris Throne ≈ 140–160). | Ledger D54: named wonders currently draw at player-ship size. | A pilot flying up to each one sees it fill the chase frame; the D54 row is deleted. |
| **GFX-3** | Rebuild the remaining places in Forge, in player-visibility order. See the ordered list below the table. | These are the last pre-Forge bodies on the default route. | Each is same-slot replaced with the live sockets. |
| **GFX-4** | Quiessence dark freighters (17 carriers) as a Forge ship family instead of `place_dead_hulk` stand-ins. | Lore beat in Pallas Drift. | The ring of 17 reads as a becalmed fleet. |
| **GFX-5** | Enable posters for all 14 player hulls in `src/ui/hullPosters.js`. The assets are already rendered. **ORRERY lane owns `src/ui`.** | Menus and the flight cluster show the flown ship for every hull. | The ORRERY lane lands the entries after a bench walk. |
| **GFX-6** | Kit upgrades the agents asked for. See the list below the table. | Every station file reimplemented these helpers. | Helpers land in `forge.py` + FORGE.md; the existing place files may switch to them. |
| **GFX-7** | Wrecks that match the ships: derive destroyed/derelict versions of Forge hulls from the Forge sources (fracture into chunks, scorch the plates, expose the frames), and replace the pre-Forge aftermath pack. | Kills and salvage are core loops; wrecks should be the ships you just fought. | The aftermath dressing uses Forge-derived pieces. |
| **GFX-8** | Asteroids: review the procedural common-rock geology (`src/render/objectSpaceGeology.js`) and the authored rock places against the Forge bar at chase camera; rebuild rock A/B/C/seamed/graffiti with the GFX-6 rock primitive. | Rocks are everywhere. The procedural geology already reads as rock; the authored rock places are older. | The rocks match the stations' material language. |
| **GFX-9** | Bolt-on parts (weapons, pods, engines under `assets/ships/parts/`): audit which still draw on the live route. Forge hulls skip bolt-ons; modular NPC kits may not. Rebuild the survivors as Forge parts or retire them. | Old-pipeline parts next to Forge hulls break the one-game read. | The census shows no pre-Forge part on the default route. |
| **GFX-10** | Performance pass on the Forge fleet: `probe-frame-solid` with a crowded Helios; dedupe the shared tile textures across GLBs in the loader (identical images are embedded per GLB today); instance repeated NPC hulls; measure GPU memory. | Consistency made sharing possible; take the win. | Frame p50/p95 and texture MB are recorded before/after in `build_map.md` §21.4. |
| **GFX-11** | Runtime attachments on Forge hulls: retro-thruster shells (`Retro_Shell_*`), plume sockets, damage hooks (`HOOK_SECONDARY/SENSOR/ARMOR`) shedding in combat, player paint override across all 14 hulls. | Runtime layers were written against the old bodies. | `flight-look` stills per hull show retros on the nozzles and a clean paint swap; a damage run sheds parts. |
| **GFX-12** | Wave F stand-ins (§13D): the pending-body stand-in is the hull's own Forge LOD2, preloaded. | No box ever. | `probe:frame-solid` rootSwaps 0; no generic marker on a cold New Game. |
| **GFX-13** | Finish master's C8 wreck import: `build-pack-release-assets` rejects the eighth authored_down file (`wreck_mining_barge.glb`); seven piece sources drifted from their release rows. | Receipts check red on master (ledger row). | The pack builder takes the barge; receipts 268/268. |
| **GFX-14** | Interior docks: rebuild `place_dock_interior` (+ grit / military) in Forge as the shipworks backdrop, keeping the composition check (0 hits). | Seen on every dock. | The shipworks screen backdrop is Forge. |

**GFX-3 order:**
1. Opening route: dead hulk, debris chunk, station billboard, lane pin, tally post, claim mark, ash pin, whistle, cold locker, memorial array (as a prop).
2. Player-built: the claim outpost family (base, bastion, catcher, fence, refinery, relay), conveyor barge and truss, drill platform, extraction mast, freight platform, radiator bank, slurry tank, transfer arm, maintenance gantry.
3. Law and travel: transponder gate, interdiction buoy.
4. The rest: Ceres wrecks, scrap cage, improvised dock, 47-A capsule, breakaway fork and SP-07.

**GFX-6 list:**
- builders: `truss(p0, p1, w, bays)`, multi-part `boxes()`/`beams()`, `annulus()`, `sphere()`, `ladder()`
- plates and bands: a vertical/radial `plate()`, region-limited `band()`, `band(mirror)` on centreline parts
- `work_lamp()` with a front lens only and an optional halo ring
- rock: a `rock()` primitive with a quarry plane, and a plain stone finish (no machinery tile)
- UV: a per-part UV scale for station-size panels
- review: a fleet-look `place` view at in-game scale that frames the whole bounding box

Pick a row, read FORGE.md and this page, and use the matching brief template. When a row is done,
delete it here and in `build_map.md` §13D Wave GFX in the same commit.
