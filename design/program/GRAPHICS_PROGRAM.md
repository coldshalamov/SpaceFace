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
| Props | **Forge:** every place on the default route — cargo pod, lane beacon, nav buoy, mining drone, worklight tower, container rack, sensor mast, the Helios lane marks, dead hulk, debris, billboard, memorial array, the claim-outpost family, industry props, transponder gate, interdiction buoy, the Ceres and 47-A story props, the breakaway fork and SP-07, the rock places, the dock interiors, and the wreck/aftermath pack (derived from the Forge ore barge, Bastion and Massline liner by `tools/blender/forge/wreck_kit.py`). Still older: the Asteroid Works board pieces (`place_works_*`) and the Wreck Cathedral. |
| Landmarks | **Forge (live):** the Candle Fleet, the Resonant Cathedral and the Skerris Throne, as new places drawn at landmark scale (`placeTargetRadius` 100/110/150), and the Quiessence ring (seventeen becalmed carriers: `place_quiessence_freighter_{a,b,c}`, variants of the Forge tanker, Span and ore barge). The Wreck Cathedral is an older pipeline. |
| Runtime look | **The Look** ([`docs/visual-assets/LOOK.md`](../../docs/visual-assets/LOOK.md), 2026-09-30): glossy lacquer, neon lamps, a mood per sector, one owner for every look value (`src/data/lookMoods.js`). Forge materials (`spacefaceFinish: forge-v1`) skip the rescue layers (roughness noise, palette multiplies, pigment) and take the shared surface response and lamp gain. |
| Interface art | HUD silhouettes are traced from the hulls (`tools/blender/forge/silhouettes.py`). Hero/side/top/holo/jig posters are rendered for all player hulls (`tools/art/render_hull_posters.mjs`). `src/ui/hullPosters.js` lists all 14. |
| Size | Release wholeships 356 MB → 60 MB. Render packages 744 MB → 456 MB. One shared 1024 tile texture set instead of per-ship bakes (v2 plating, 2026-09-30: recessed seams, dog-eared plates, uniform albedo). |

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
  Put `SF_GL=d3d11` in front to shoot on the real GPU (seconds a body). A kit change that touches
  the shared textures or a finish needs every body re-exported: run the Blender `--live` exports
  in parallel, then `publish.mjs <all ids> --skip-blender`.
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
2. **The look bar is FORGE.md §"The look".** It covers plan silhouette first, three values, identity colour in bands, layered construction, light as design, no noise, the lacquer finish, nothing floating and one idea per body. Judge paint in `fleet-look` under the Look, never in Blender.
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

## 4. Backlog

Empty (2026-09-28): GFX-1 through GFX-14 are done. The trade hub and its faction overlays, every
place on the default route, the Quiessence ring, the wreck pack, rocks and dock interiors are Forge;
all 14 hull posters are live; hull retros, damage shedding and paint are proven per hull; no pre-Forge
bolt-on draws on the default route; a pending ship shows its own low-detail body instead of a marker;
shared images upload once (texture memory about 92 → 50 MB, `build_map.md` §21.4). Bodies outside the
old backlog that are still older pipeline: the Asteroid Works board pieces (`place_works_*`) and the
Wreck Cathedral. New work goes here as a numbered row before dispatch; §5 lists the bigger bets.

**GFX-15 (owner, 2026-09-30): light graphics upgrades.** Every player hull now carries a lit identity
trim (13 hulls in one sitting, zero frame cost). The same loop, in ROI order, for the 25 NPC hulls, the
68 places, close-zoom hero detail and the sector moods is the goal prompt
[`GRAPHICS_LIGHT_UPGRADES_GOAL.txt`](GRAPHICS_LIGHT_UPGRADES_GOAL.txt); the in-Blender design helpers
are `tools/blender/forge/mcp_design_kit.py`.

**GFX-16 (owner, 2026-10-01): make the world feel alive.** Motion, blinking and ambient life with weight and micro-movement, plus
the thruster plume. Plan and slice order: the retired GFX16 plan (git history; carried-open decisions appended below). Status 2026-10-02: slices 1 (thrusters), 2 (nav lamps), 3 (motion judge + smoothing) and 5 (pickup
shapes) landed; see the plan's §6 for what is next. GFX-15 status: Workflow A and B tiers 1-3 landed; C and tier 4 partly built, see the HANDOFF in `tools/blender/forge/briefs/`.

**GFX-17 (2026-10-24 audit): Wreck Cathedral Forge rebuild.** The heaviest body in the game
(`place_landmark_wreck_cathedral`: 258,746 tris, 19.6 MB, 512px textures) is still the old
Blender pipeline, and it is a named world site on the Ceres default route
(`world_site_wreck_cathedral`, `src/data/worldSiteManifests.js`) — a story landmark off-kit.
Outcome: one Forge place (`layout: 'place'`, landmark scale 40–100k tris, shared tile set,
`deadmetal` derelict finish) carrying EVERY existing gameplay contract — anchors
`INTERACTION_HangarCavity`, `ZONE_Bridge`, `ZONE_Service_Port/Starboard`, `SOCKET_TheMarker`,
`SALVAGE_ConduitBank`, `SALVAGE_ServiceRack`, all collision proxies and the mining-beam request
stream at their live positions (`export_place` from the current file first). Done when:
`fleet-look --file … --views=inspect,top,place` passes the look bar beside the other landmarks,
`node scripts/check-parts-manifest.mjs` and the world-site probes stay green, and the released
bytes land under 8 MB.

**GFX-18 (2026-10-24 audit): provisional-house visual language.** The six R10 houses
(Understory, Fulfillment, Archive, Pitborn, Frontier, Verge — `docs/worldbuilding/orgs/factions-CANONICAL.md`)
fly with doctrines but no hull identity: a contact cannot read the house by outline or paint.
Outcome: paint-only Forge variants (`tools/blender/forge/variant.py`) on the hulls their
presence nodes already fly, one house language per row of the canon sheet — Understory
moss/compost tones on salvage hulls, Fulfillment worn company livery with dead schedule marks,
Archive lantern-lit reading-room glow, Pitborn scrapyard hazard + tally stencils,
Verge measure-mark bands that never blink. Done when: each house's NPC reads at chase zoom in
`fleet-look --fleet --only=…` under its home sector's rig, and the variant publish passes
`check-render-package-pilots`. Helix stays deliberately unvarianted: the canon says it flies
other houses' transponders and hulls — mimicry IS its identity.

**GFX-19 (2026-10-24 audit): house graffiti as authored decals.** Every canon house carries one
graffiti line ("Every name logged…", "Heavy is honest.", "PRESENT. WITNESS. APPEAL."…) that
exists in text (`src/data/flavor/030-graffiti.js`) but not on any surface. The owner's
2026-10-03 authored-decals ruling allows decal quads; `stencil.stamp` already cuts real
lettering geometry. Outcome: each house's line stamped where its encounters stage them
(Pitborn yards, Verge gates, Concord beacons, MTS boards), one shared authored alphabet,
tinted by paint colours. Done when: the marks read at the close zoom in `flight-look` at their
encounter sites, and no lettering is generated text over a texture.

**GFX-20 (2026-10-24 audit): ship-budget triage.** Census of `parts_manifest.json` (2026-10-24):
21 wholeships exceed the 10–45k LOD0 guideline — tanker 70.9k, cradle 68.9k, rescue lifter
68.5k, yard tug 65.5k, arclight 64.3k, saucer 60.6k, colossus 59.2k … — none carries an explicit
`budgetClass`. Most are large-class hulls where the count is defensible; the manifest's own
byte guards hold. Outcome: for each of the 21, either record the explicit `budgetClass` in the
Forge source/fleet entry, or trim LOD0 to the guideline via `s.detail` drops (never authored
visual removal). Done when: `check-parts-manifest` shows zero silent over-guideline hulls.

**Audit sitting note (2026-10-24, corrected same day).** Full-fleet live renders re-shot
(451 shots, three contact sheets, `.devshots/fleet-look/`), VFX lab repaired to boot against
the payload-gated pool init (`scripts/vfx-gameplay-demo.html` + its adapter libs), and the
vision pass delegation clarified: GLM-5.3-Flash subagents DO see image content natively
through `Read` (verified: a flash agent read a fleet-look PNG and described it). The
`analyze_image` MCP 400s seen from the audit session were that session's gift-credit plan
being unable to call the MCP — not a service outage; the MCP is fine on a normal
subscription and stays in the agents' tool lists. Separately, `glm-flash-vision` as defined
fails to spawn with `reasoning-level-missing` until its frontmatter names a thought level
(owner's call). First real vision finding: several small-hull CHASE crops measure near-black
(hornet chase stdev 4.3) — pursue whether small hulls read too dark at the gameplay camera.

**First vision-audit findings (2026-10-24, GLM-5.3-Flash subagent over fleet-look renders,
player hulls batch 1 of 14).** Best-in-class reference: **Kestrel** (full lamp set, three-value
separation, cut bands, name livery, readable to chase zoom). Defects, ranked:
1. **Hornet — empty frame at the gameplay chase camera** (close/inspect pass; renders
   beautifully at close zoom). Root-cause in progress: harness framing vs def-radius vs game.
2. **Wasp — value compression**: no light-primary value anywhere (near-black-on-black carried
   only by cyan lamp stripes) + one stray bright-white underside panel outside the lamp
   language. Forge-source paint fix in progress.
3. **Helios Lark — incomplete lamp complement**: no red/green navs at any extremity, twin
   stern nozzles dead dark, stern reads inert. Forge-source lamp fix in progress.
Minor notes: drifter's cyan edge-glow borders on painted-outline (within style); mule
containers are the most matte surface in the fleet (suits a hauler). pelican/drifter/mule/
kestrel all PASS both views; wasp and lark carry their chase read via lamps alone.

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
9. **Markings & texture expansion** (2026-11-01 audit; full survey in the session report). What shipped: five canon house decal styles in the existing stencil pipeline — `probate` (Meridian toll ledger), `addendum` (Vael contract plate, READ PAGE 9), `heavy_is_honest` (Pitborn chant + scale + tally), `dead_schedule` (Fulfillment routing plate, filed company), `gate_law` (Verge directives + measure band) — drawn in code, one shared 1024px sheet each, zero new program families, wired through `SHIP_DECALS` / `SHIP_DECAL_STOCK` / `PAINT_PROFILES` (corporate, xenophobic, pitborn_patchwork, clinical_automaton, nacre_precursor). Contract tests green (28 pass incl. the new `test/house-decals.test.mjs`). **Verification status:** the shader chain itself is proven (an isolated in-page render of `installIllustratedSurface` + a real payload paints the mark), and every data layer checks out live (payload stamped on hull/mechanical/accent materials, per-material `sfStencilStrength`/`sfStencilMap` correct, `sfHullPosition` present on the deck meshes). But no stable hull still from `fleet-look` could be produced on 2026-11-01 to judge the marks by the picture: the fixture repeatedly returned blank or misposed frames under concurrent GPU load (related to the known "empty frame at the gameplay camera" defect, GFX audit finding #1). **The picture-level look check for these five styles — and for the four shipped styles, whose marks were also not identifiable in any still — is still owed.** Suspected (unproven): a render-path integration defect that keeps the stamped payloads out of the GPU draw even though the uniforms read correctly; first suspects are the LOD/upgrade material swap after `installShipStencils`, or per-material uniform upload through the shared illustrated-surface program. Follow-up packets, in value order:
   - **House graffiti bands on places (GFX-19 stays the packet).** The hull decals prove the pipeline; the walls at Pitborn yards, Verge gates and MTS boards want the same treatment via the station paint layouts (kind 4/6/8) in `illustratedHullLayout.js`.
   - **Wire the `spacepunk_markings_v1` atlas** (orphan, 32-cell basecolor+emissive, `assets/ships/foundry/spacepunk_markings_v1/`) as a authored motif source for one hero hull — the census flags it as input to Kestrel surfacing; check manifests before authoring more texture content.
   - **Faction crests on hulls.** The 14 generated crest WebPs (`assets/ui/generated/crests/`) are UI-only; FORGE rule 3 explicitly sanctions a faction crest decal. Needs an async sheet loader (crest image → stencil sheet cell) or an atlas + per-material UV offset in the stencil payload; keep words in code.
   - **Scratch language on the fleet.** The `scratch()` scrape helper landed for house decals; extend `stencilPayloadFor` wear scaling so `veteran` wear adds scrape clusters to the four original styles (targeted wear, not the fleet-wide grime the owner declined).
10. **Per-asset blind-spot scan** (2026-11-01; the "actually look at every model" pass — first tranche verified by direct GLB inspection, `scratch/asset-dive/` tooling, and the 2026-10-27 census):
   - **Dead LOD1 packages: 16.0 MB of the 263.7 MB package payload is provably unfetchable.** `WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false` (wholeShipLodPolicy.js:19, owner ruling 2026-09-29), admission always builds LOD0, `warmHullFilesForSpecs` deliberately never warms LOD1 ("a file nobody can select on the live top-down route"), and family-controller transitions only swap already-resident levels. 33 `-lod1` render packages ship and cannot load. Fix: exclude LOD1 from the release package set (keep Forge sources). Verify: `check:release-manifest-pins`, cold-start bytes.
   - **Tint-only material slots: 4,623 of 6,734 (68.7%)** — the kestrel ships 17 materials for 6 texture sets (11 are baseColorFactor-only variants). Confirms the ASSET_PERFORMANCE_PROGRAM pole #2; fix is the release-time COLOR_0 identity bake + `mergeGroups` (17→~5 per hull), per-hull A/B by `fleet-look`.
   - **Double-sided materials on the wreck/works economy: 141 files ≥50% two-sided** (all aftermath wrecks — the 308-prim ore-freighter bow is 15/15). Backface culling is off for every shell. Fix: per-prim closed-shell test at publish, single-side the shells, keep 2side for open plates; per-asset A/B.
   - **Primitive fragmentation:** the wreck family averages ~32 tri/prim (308/128/89-prim files; 2,511 fleet prims in fragmented files). Merge-by-material at publish; draw-unit + planner cost.
   - **Duplicate embedded textures: 1.1 MB** across 8 packages (fin-wedge ships its 1.1 MB trim sheet twice plus a doubled wear mask). `dedup()` at publish.
   - **`COLLISION_HULL` nodes ship in 278 of 414 render packages** though the loader hides them (assetLoader.js:1604) and collision truth is data-side proxy manifests — pure parse/decode/RAM cost. Strip from render packages, keep in parts sources.
   - **Dead lamp materials: 26 across 18 files** (named glow/lamp/beacon with zero emissive) — per-file triage: intentional on wrecks, a visual bug on live assets.
   - **1,020 empty unnamed nodes across 91 files** — prune at publish.
   - **Stale-pole check:** the "oversized 2048 place textures" item is DONE — every textured file in the current census is ≤1024. The traps list needs a freshness pass too.
   - Visual defect layer: vision-agent review of the 518 fleet stills is the running second tranche; first manual find: `place_ceres_bait_wreck` renders a flat near-black value with the banned full-hull rim-outline glow, no wreck-damage language, and orphan light squares. **Hulls batch (71 stills read) found two systemic issues:** (a) continuous emissive edge strips as the primary hull identity — wasp (all five liveries), bastion, ashline_dart/dart_choir, ranger_archive_censor/verge_surveyor read as neon outlines over flat dark fills; (b) spine light strips clipping to white (mule, mule_fulfillment_hauler, atlas, ironback) — one emissive-intensity cap + "strip→discrete lamps" swap on three hulls fixes most of the batch. Model citizens: yard_tug, drifter (+helix_courier), ironback_pitborn_junk, mule_pitborn_junk, ashline_lode (+vael), apron_shuttle. **Wrecks/components batch (60 stills read) found:** `wasp_frag_aft/bow` render as pristine neon-striped nav-lit ships with clean geometric cut planes — zero wreck dressing (worst asset in the set; fails the wreck read at every view) — **root-caused in the GLB: the family ships a fully living material set (`Emissive_Cyan` at 1,300 tris, 3.8k-tri amber beacon, live NAV hooks, live thruster core) while the ore-freighter wreck family uses `__dead` zero-emissive variants; the dead-material pass never ran on wasp_frag**, and an `Armor_torn` material proves dressing was started; `pod_cargo_container` has a cyan glow arc z-clipped through its corner; value-flatness list (towline_kit/mara black deck boxes, red_kite's flat-red wing, saucer underside, mothlight_lamp fins). Fleet language families (helios ×5, towline ×4, borrowed_voice ×4, ilex, kilnback+cask) all PASS. **Places/stations batch (191 views read) found:** the close-camera defect at scale — **~57 of ~100 place/kit close views are empty or misframed** (all `var_station_kit_*` but three, most asteroid close views, second_measure set, claim_outpost base/catcher/refinery, whistle, and more). **FIXED 2026-11-01 (fleetLook.js poseCamera + shoot settle order):** `close` now fits distance to the bounding sphere (the documented ~450 px contract; the fixed 58 WU was tuned for one hull size class), `inspect`/`top`/`side`/`front` aim at the bbox centre instead of the origin, and the settle wait now yields a frame before checking pending states (checked too early, the authored boundary had stamped nothing and file-target places measured an empty pre-upgrade marker). Verified: `borrowed_voice_a`, `place_asteroid_rock_a`, `place_ceres_bait_wreck` close views now frame their subjects; kestrel close unchanged-or-better (auto-fit ≈ 57 WU for standard hulls). Real asset defects remaining: `var_station_kit_verge_v01` bare grey-lavender beams, zero lamps, unreadable; `place_claim_outpost_bastion` untextured red disc on navy; `place_ash_pin` single-hue cyan with an inert black tower; `place_asteroid_seamed` green cap + yellow rim reads as z-fight; floating cyan quad on `place_rock_metallic_ore_boulder`; `place_rhea_slag_hauler` near-black hull, one lamp; tall-asset inspects clip tops (nav_buoy, sensor_mast, extraction_mast, worklight_tower, tally_post). Reference standard (keep): the station family (trade_hub/blackmarket/fab/military/mining/refinery/research), gate_jump_ring, memorial/candle landmarks, radiator_bank, dock pads — the warm-vs-cyan lamp fight reads everywhere on those.

The preceding 2026-11-01 audit additions are a snapshot of observations and opportunities,
not new operating rules or a current defect census. Exact runtime and release manifests and the
Finish Program's current measurements take precedence. In particular, prior closed-shell culling
work and later preview repairs must be reconciled before treating an old finding as unfinished.
House-marking data and shader checks passed, but the current Kestrel preview still produced zero
target draws; the five new styles have no accepted on-hull readability check yet.

## 6. How to judge a graphics change (the review ritual)

- **Look at the real renderer.** Use `fleet-look` for models, `flight-look` for the game and `ui-bench` for screens. A receipt, a triangle count or a passing check is not a picture.
- **Compare against neighbours.** Check the contact sheet (`fleet-look --fleet`) and the whole station row. The failure mode of a big program is one body drifting off-palette.
- **Stranger test.** Would someone who never saw the game say these belong to one game, and can they tell what each thing does?
- **Push every packet.** The VM is ephemeral. Commit with pathspecs and push after every finished body or batch.

## GFX-16 alive-motion — carried-open decisions (plan retired 2026-10-15; landed slices in git history)

STILL OPEN (decided, not forgotten): trade-hub life stays baked flat: it is the biggest body, ~1350 WU from spawn, and `flight-static-v3` exists to keep the opening frame sacred; a carve-out
needs an on-GPU frame measurement first. Animated-station draw cost (+9-14 draws each) and a real-GPU look at plume ramps, nav-lamp blink and station motion still want one owner flight;
gate spin-up for NPC traffic needs traffic that uses gates (sim); debris variety (only more shape variants would help); more faction hulls only when a sector needs them.

