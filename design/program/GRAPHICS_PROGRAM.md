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
| Stations | **Forge:** refinery, mining rig, fab yard, military bastion, research array, black-market warren, jump gate, trade hub and its three faction overlays (`var_station_trade_hub_{free,mts,scn}_overlay_v01`). |
| Props | **Forge:** cargo pod, lane beacon, nav buoy, mining drone, worklight tower, container rack, sensor mast. Everything else under `assets/ships/parts/places/` is still an older pipeline (see backlog GFX-3). |
| Landmarks | **Forge (live):** the Candle Fleet, the Resonant Cathedral and the Skerris Throne, as new places drawn at landmark scale (`placeTargetRadius` 100/110/150), and the Quiessence ring (seventeen becalmed carriers: `place_quiessence_freighter_{a,b,c}`, variants of the Forge tanker, Span and ore barge). The Wreck Cathedral is an older pipeline. |
| Runtime look | Forge materials (`spacefaceFinish: forge-v1`) skip the rescue layers (roughness noise, palette multiplies, pigment). The procedural PBR fallback no longer stamps fine-grain relief on manufactured surfaces. |
| Interface art | HUD silhouettes are traced from the hulls (`tools/blender/forge/silhouettes.py`). Hero/side/top/holo/jig posters are rendered for all player hulls (`tools/art/render_hull_posters.mjs`). `src/ui/hullPosters.js` lists all 14. |
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
4. Step 3 is not automated yet; follow it by hand.

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
| **GFX-3** | Rebuild the remaining places in Forge, in player-visibility order. See the ordered list below the table. | These are the last pre-Forge bodies on the default route. | Each is same-slot replaced with the live sockets. |
| **GFX-7** | Wrecks that match the ships: derive destroyed/derelict versions of Forge hulls from the Forge sources (fracture into chunks, scorch the plates, expose the frames), and replace the pre-Forge aftermath pack. | Kills and salvage are core loops; wrecks should be the ships you just fought. | The aftermath dressing uses Forge-derived pieces. |
| **GFX-8** | Asteroids: review the procedural common-rock geology (`src/render/objectSpaceGeology.js`) and the authored rock places against the Forge bar at chase camera; rebuild rock A/B/C/seamed/graffiti with the GFX-6 rock primitive. | Rocks are everywhere. The procedural geology already reads as rock; the authored rock places are older. | The rocks match the stations' material language. |
| **GFX-9** | Bolt-on parts (weapons, pods, engines under `assets/ships/parts/`): audit which still draw on the live route. Forge hulls skip bolt-ons; modular NPC kits may not. Rebuild the survivors as Forge parts or retire them. | Old-pipeline parts next to Forge hulls break the one-game read. | The census shows no pre-Forge part on the default route. |
| **GFX-10** | Performance pass on the Forge fleet: `probe-frame-solid` with a crowded Helios; dedupe the shared tile textures across GLBs in the loader (identical images are embedded per GLB today); instance repeated NPC hulls; measure GPU memory. | Consistency made sharing possible; take the win. | Frame p50/p95 and texture MB are recorded before/after in `build_map.md` §21.4. |
| **GFX-11** | Runtime attachments on Forge hulls: retro-thruster shells (`Retro_Shell_*`), plume sockets, damage hooks (`HOOK_SECONDARY/SENSOR/ARMOR`) shedding in combat, player paint override across all 14 hulls. | Runtime layers were written against the old bodies. | `flight-look` stills per hull show retros on the nozzles and a clean paint swap; a damage run sheds parts. |
| **GFX-12** | Wave F stand-ins (§13D): the pending-body stand-in is the hull's own Forge LOD2, preloaded. | No box ever. | `probe:frame-solid` rootSwaps 0; no generic marker on a cold New Game. |

**GFX-3 order:**
1. Opening route: dead hulk, debris chunk, station billboard, lane pin, tally post, claim mark, ash pin, whistle, cold locker, memorial array (as a prop).
2. Player-built: the claim outpost family (base, bastion, catcher, fence, refinery, relay), conveyor barge and truss, drill platform, extraction mast, freight platform, radiator bank, slurry tank, transfer arm, maintenance gantry.
3. Law and travel: transponder gate, interdiction buoy.
4. The rest: Ceres wrecks, scrap cage, improvised dock, 47-A capsule, breakaway fork and SP-07.

Pick a row, read FORGE.md and this page, and use the matching brief template. When a row is done,
delete it here and in `build_map.md` §13D Wave GFX in the same commit.

## 5. Directions beyond the backlog (where the picture goes next)

These are bigger bets, in rough value order. Each needs a short packet (outcome, done-when, files)
before dispatch.

1. **Life on the structures.** Make stations and ships feel alive, all with cheap uniforms or node rotations and no per-frame allocation:
   - radar arms that sweep, cranes that traverse, landing lights that chase toward the dock mouth, beacons that blink;
   - parked shuttles that sometimes undock.

   Forge can tag parts (`s.detail`, or a new `s.anim = 'spin:z:0.4'`) that the runtime drives. Start with the nav blink and the dock-approach chase lights: they make docking readable.
2. **Damage you can read.** Forge hulls carry `HOOK_SECONDARY/SENSOR/ARMOR` parts. Add authored damage states:
   - scorched panel sets;
   - a sheared sponsor;
   - an exposed frame variant per finish;
   - blackened bands swapped in by hull fraction.

   Wrecks (GFX-7) and damage share the same fracture tooling.
3. **Faction language in the silhouette.** Helios is rounded and ivory, Ashline angular and rust, the work fleet chunky with hazard bands. Extend that to every faction that flies (Coalition navy, Choir, Quiet, Reach), so a contact reads by outline before its colour. Build variants with `tools/blender/forge/variant.py` for paint-only kits, and give a faction its own hull when its role differs.
4. **Sector mood from light, not texture.** The same Forge bodies look different under each sector's key/fill/rim (`SECTOR_VISUAL_PROFILES`). Tune the six way-of-life sectors so the Vesta foundry is hot, Pallas cold and Sker Haven sodium. Verify with `fleet-look` using that sector's lighting; add a `--sector=` flag.
5. **One kit for rocks and wrecks.** Add a Forge "geology" and "debris" module (GFX-6/7/8) so asteroids, wreck fields and quarried station rocks share one material language with the ships.
6. **Close-zoom hero detail.** At 58 WU the ship is about 450 px. Add a close-only LOD0+ detail layer: rivet rows, hatch outlines, cockpit interiors behind the glass. Drop it at chase zoom so the fleet budget holds.
7. **Interface as instrument.** The ORRERY lane owns the screens. Graphics owns the art feeding them: holo glyphs, jig drawings and hero posters for every flyable ship, station exteriors for dock screens. Keep them regenerated from the models (`render_hull_posters.mjs`); never hand-draw a ship.
8. **Measure what it costs.** Make `probe-frame-solid` in a crowded Helios scene part of every graphics packet's evidence (GFX-10). The Forge fleet shares one texture set, so texture memory should fall as older assets are retired; record it.

## 6. How to judge a graphics change (the review ritual)

- **Look at the real renderer.** Use `fleet-look` for models, `flight-look` for the game and `ui-bench` for screens. A receipt, a triangle count or a passing check is not a picture.
- **Compare against neighbours.** Check the contact sheet (`fleet-look --fleet`) and the whole station row. The failure mode of a big program is one body drifting off-palette.
- **Stranger test.** Would someone who never saw the game say these belong to one game, and can they tell what each thing does?
- **Push every packet.** The VM is ephemeral. Commit with pathspecs and push after every finished body or batch.
