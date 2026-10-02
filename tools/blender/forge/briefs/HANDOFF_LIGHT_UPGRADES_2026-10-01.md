# Handoff — GFX light-upgrades (lit identity trims and lit structures), 2026-10-01

Goal prompt: the four-workflow "make SpaceFace look great with graphics work that costs the frame
nothing" brief (lit trims on NPC hulls; lit structures on places; close-zoom hero detail on player
hulls; sector mood pass). This file says exactly what is DONE on `origin/master`, what is NOT, and
the recipe that worked, so the next agent starts at the first open body and not at the reading list.

## LIVE PROGRESS LOG (the next agent starts at the first line that is not DONE)
Update this block after every batch; it is the pickup point. Each line: body — state — what is lit.

Sitting 2 (2026-10-01, from 02:30): Workflow A, the 8 open hulls — all EDITED, BUILT, SHOT, pictures judged.
- helios_arclight — SHOT OK (lit teal runway up the arc + bow ring each hull; LOD0 35758 -> 40790)
- ashline_rig — SHOT OK (lit sodium line down each black rail cap; LOD0 23458 -> 23922)
- ashline_rig_corsair_blade — SHOT OK (lit sodium line inside each aft blade edge; rails unlit under armour; LOD0 22724 -> 24020)
- survey_pin — SHOT OK (stock glow_cyan, its own lens colour: two hull rings aft of the canopy / ahead of the plinth, collar ring, plinth ring, array-root lines; yellow washed out on the orange; LOD0 22584 -> 31756)
- rescue_lifter — SHOT OK (lit yellow line down each cradle rail top; LOD0 40518 -> 43774)
- prospector_skiff — SHOT OK (lit yellow line along each saddle tank, broken at the hazard band; LOD0 23356 -> 24480)
- scrap_sweeper — SHOT OK (lit yellow line inside each arm's outer edge; LOD0 20666 -> 22066)
- volatiles_tanker — SHOT OK (lit yellow ring on cab behind the shield + ring on the drive block; LOD0 41348 -> 44932)
WORKFLOW A COMPLETE: all 8 published, checks green, committed per body on local master
(421201d68..e437d9296; generated manifests/packages/census ride on e437d9296). Landing on origin/master
via the worktree recipe is the NEXT step if these shas are not on origin yet (`git branch -r --contains e437d9296`).

WORKFLOW A LANDED on origin/master (24908e9e1, 2026-10-01 ~03:20). Done.

Sitting 2, Workflow B tier 3: all 20 live files shot and judged; WORKFLOW B TIERS 1-3 LANDED on origin/master (7051cf449, 2026-10-01 ~04:05).
- ALREADY LIT, no change (9): extraction_mast, freight_platform, conveyor_barge, conveyor_truss, radiator_bank,
  sensor_mast, slurry_tank, container_rack, mining_drone
- LIT THIS SITTING (11, stock glow_amber, no new materials; LOD0 before -> after):
  claim_outpost_{base 16840->21192, bastion 26124->30476, catcher 24528->28880, fence 27256->31608, refinery 30728->35080,
  relay 22924->27276} via `claim_outpost_kit.py` (0.5 m amber line down each module-pad rail face + 0.7 m line across the
  dock head); drill_platform 6388->6900 (line along both long deck edges); maintenance_gantry 8248->8296 (line down each dark
  rail lip); transfer_arm 4704->5856 (lines along the base edges + ring round the pedestal); scrap_cage 4912->4976 (stripe
  along both long top rails); improvised_dock 3064->3576 (line across the root plate + across the cradle)
- Trade-hub faction overlays (free/mts/scn): looked at 2026-10-01; already lit (cyan pod lamps + warm windows; gold-lit pods;
  blue-lit ring edge). No change.
AUDIT 2026-10-01 (the done-checks, judged by looking at the sheets):
- Workflow A: `fleet-look --fleet --only=<25 npc ids> --views=close` AND `--views=chase`: all 25 show a lit trim at the chase
  camera. Weakest: inspection_cutter (quiet authority-blue chevron + strobes). Left as is.
- Workflow B tiers 1-3 (40 bodies, `--views=place`): every body reads lit at the chase tilt; ash_pin and whistle are dark on purpose.
- Workflow D (moods): all six target moods exist in `src/data/lookMoods.js` and every sector resolves to the right one
  (helios/core arcade, tethys+fringe neon_noir, belt+ceres dust_gold, vesta forge_heat, pallas cold_drift, sker sodium_yard,
  anomaly void_signal). Judged on `look-bench` sheets: moods are distinct, space stays black, nav red/green legible. An A/B of a
  stronger dust_gold under the real Ceres rig was indistinguishable, so NO mood values were changed.
- Workflow C budget finding: LOD0 triangles today: ironback 44418, warden 46394, colossus 58884, leviathan 53040, saucer 60270 are
  at/over the 45k cap, so they get NO detail layer. wasp (39484) is skipped too: three NPC variants build over wasp.py.
- Left out of the place list on purpose (goal file): rocks, debris_chunk, cargo_pod_standard, pod_cargo_container (no lights on
  geology or loose cargo); place_ore_bulk_container and place_scratch_kit are not in fleet.json (not live).
PICKUP POINT (written when the usage limit hit, 2026-10-01 ~05:35). LANDED on origin/master: Workflow A (25 hulls),
Workflow B tiers 1-3 (40 bodies), D audited (no change). NOT LANDED, nothing below is committed or published:
- Tier 4 landmarks (helper t4a, DONE, pictures judged OK): EDITED place_station_billboard (lattice moved behind the lit
  face, corner lamps onto the lit face; 6024), place_47a_rescue_capsule (warm viewports mirrored to the visible flank;
  4800 -> 5600), place_cold_locker (cyan status run mirrored to the visible flank; 6104 -> 6176). UNCHANGED, already read right
  (PNGs in `.devshots/h4-*`): landmark_resonant_cathedral, landmark_skerris_throne, memorial_array, pod_47a_evidence_spindle
  (one amber ledger lamp = the derelict rule), breakaway_fork, breakaway_sp07; landmark_candle_fleet was already lit.
- Workflow C hull detail layer: recipes are EDITED in the working tree, NOT published or committed. All use `detail=2`, no new
  Material_*, insertions only (verified by the helpers; re-verify). LOD0 before -> after: hornet 13428->15776, pelican 25170->27174,
  mule 24694->26446, ranger 27564->32820, kestrel 33160->36182, massline_express_liner 32860->35024, drifter 36768->38798,
  atlas 38196->39668. JUDGED by a helper at close+chase: hornet, pelican (last 0.12 rim not re-shot), mule (last handle/wall-line edit
  not re-shot), ranger, kestrel. liner: re-shoot the final recipe (the `c1-massline_express_liner-after` PNGs are an OLDER variant).
  drifter and atlas: BUILT, NEVER SHOT (check atlas clamp-bar studs in `bare` for chase speckle). BASTION: NOT STARTED (notes: gunmetal
  outlines on the dark slate deck, dark outlines on the lighter citadel, fastener rows on belts/citadel/turret houses/drive block,
  conduits along belt roots, gunmetal frame round the missile hatch grid; use the draped-beam helpers `skin_z/drape/rect/studs` at
  the top of ranger.py; band/panel cuts on bevelled lofts cost ~16k tris, avoid). Canopy glass renders opaque, so no cockpit tub is
  visible; detail is coamings and bows. Use `--yaw=20` for a second chase angle (`--heading` is ignored for chase). If a hull fails the
  look, revert ONLY that recipe with `git checkout -- <recipe>`.
- Tier 4 kit places (t4b): DONE quiessence_freighter_{a,b,c}: `quiessence_freighter_kit.py` now strips the lit-cyan trims the freighters
  silently INHERITED from the tanker/helios_span base recipes (45304->41720, 34674->32210, 39678->35918; equal to the live files, so
  the becalmed look is preserved). NOT DONE: dock_interior{,_grit,_military} (bay already lit; missing a dock-mouth read: threshold
  bar + 16-lamp amber/cyan chase at the open -X kerb; shoot with `fleet-look --yaw=225`), and dead_hulk / ceres_bait_wreck /
  ceres_grave_shard (judge pictures only; their lamps are authored story, do not strip lights to hit a lamp count).
- INHERITANCE LEAK CHECK (new risk): any recipe/kit that imports or builds over an edited base picks the edit up silently on its next
  rebuild. Before publishing, rebuild every dependent of an edited base and compare `tris=` and Material_* to its live file; a count
  that moves with no edit to that body is a leak.
- To land: `publish.mjs <ids>` in ONE batch (place ids and hull ids may mix), the three checks + section 2.5 checks
  (`check-graphics-asset-receipts`, `check-station-archetype-glb-load`, `check-station-archetype-wiring`, the two pilot/coverage tests),
  commit per body by pathspec, land via a worktree (recipe below), then for HULLS only: `blender -b --python
  tools/blender/forge/silhouettes.py | grep SILHOUETTES_JSON`, posters (`SF_POSTER_SAMPLES=24`, ~3 min/hull, detached, one at a time,
  `node tools/art/render_hull_posters.mjs ship_<id>`), `node --test test/hull-integrity.test.mjs test/j07-hud-contract.test.mjs`.
  Finally the frame gate: `node scripts/probe-frame-solid.mjs --headless --compare=.devshots/frame-solid/2026-09-30T20-10-40-324Z.json`
  in the foreground on a quiet host (longest frame and p99 must not rise). NOT RUN YET for the landed A + tier 1-3 work.
- Traps seen 2026-10-01: several recipes are CRLF at HEAD and an editor can flip them to LF (a 5-line change shows as 200+;
  check `git diff --stat <recipe>` before committing); the Blender MCP socket (127.0.0.1:9876) did not answer, use headless
  Blender; a stale `probe-frame-solid` tree was burning a core for 10 hours (killed); under heavy load even `ls` takes a minute
  (Defender scanning), so do not poll `.devshots` (thousands of folders).
- One test failed in the shared tree (`render-package-pilots.test`: "deferred pool retirement drains clean after object cleanup
  refusal") but passes 25/25 on clean origin/master: it comes from another lane's uncommitted `src/render/partsLibrary.js`.
- GRAPHICS_PROGRAM.md GFX-15 row not yet updated with this status.
Working files: shots in `.devshots/gfx-a2/<id>/`, before counts `.devshots/gfx-a2/before.log`.

## Read first (10 minutes, no more)
- `tools/blender/forge/FORGE.md` — look bar items 5 and 7, the kit table.
- `design/program/GRAPHICS_PROGRAM.md` §3 (rules) and §6 (how a change is judged).
- Reference diffs, all on master: `git show 00d12bce7 -- tools/blender/forge/ships/hornet.py`
  (wing leading-edge band), `git show 58e5b0f3e -- tools/blender/forge/ships/bastion.py` (plate
  edge outline with `region` and the outboard-normal maths), `git show c136fc090 --
  tools/blender/forge/ships/yard_tug.py` (a lit bar as `F.box` + keel line), and the batch
  `git log --oneline --grep="feat(forge)" --since=2026-09-30` (13 NPC hulls + 4 places).

## State on origin/master (verified by looking at the fleet-look picture)

### Workflow A — NPC hulls (25)
DONE (lit at the chase camera, published, census/packages fresh):
helios_lark, helios_cradle, helios_span, helios_span_dmc, helios_span_mts, helios_span_reach,
apron_shuttle, inspection_cutter, ashline_dart, ashline_lode, ore_barge, repair_tender,
salvage_cutter, wasp_scn_patrol, wasp_mts_escort, wasp_free_militia (the three Wasp variants were
already lit by their `glow_cyan` override; confirmed, no change), yard_tug (earlier).

OPEN (start here): helios_arclight, ashline_rig, ashline_rig_corsair_blade (variant over
ashline_rig — inherits once the base has the line; shoot to confirm), survey_pin, rescue_lifter,
prospector_skiff, scrap_sweeper, volatiles_tanker.

Family rules already used (keep them so each faction reads as one light):
- Helios civil: ONE variant `'glow_cyan.helios': '#hex'` = that hull's occupation colour lifted
  to light (teal #3ee8dc, freight blue #6ec0ff, copper #ff8a3c, gold #ffb43a, crimson #ff3a4a);
  placement = a cabin trim ring on the ivory just aft of the occupation band, plus one line
  along the body (spine runway / roof edge). Cradle used stock `glow_amber`.
- Ashline: `'glow_cyan.sodium': '#ff8a2a'`, a thin line just inside the blade / shoulder edge on
  the dark top (0.1 wide, 0.2–0.3 m inboard, `facing=(0,0,1)`, `mirror=True`, x-bounded region).
- Work fleet: `'glow_cyan.rust': '#ffd23a'` (same name and hex as the yard tug), a bar across the
  working end (hopper lip, arm spine, scoop lip, manifold rail) on a DARK surface, never on the
  hazard-yellow band itself (same colour vanishes).

### Workflow B — places
Tier 1 (stations): all seven already read lit at `--views=place` (windows, rim lights, beacons,
dock lamps). Military was the grey one; DONE: lit red belt outline + lit hangar threshold.
Trade-hub faction overlays (`var_station_trade_hub_{free,mts,scn}_overlay_v01`): NOT looked at.

Tier 2 (wayfinding): looked at all 11 live files. Already lit, no change: gate_jump_ring,
lane_beacon, nav_buoy, tally_post, worklight_tower, transponder_gate. DONE: lane_pin (lit teal
rim ring on the float), claim_mark (lit amber outline round the plate edge), interdiction_buoy
(lit cyan belt). Left dark on purpose (derelict rule: one weak live lamp): ash_pin, whistle.

Tier 3 (outposts/industry, 19 places) and tier 4 (landmarks/story, ~22): NOT started.
Shoot the live files first — many already carry lights; add only what the picture lacks:
`SF_GL=d3d11 node scripts/fleet-look.mjs --file=assets/ships/parts/places/<file>.glb
--name=<id> --views=place --out=.devshots/gfx-live-<id>` (≈1 min each, chain them).

### Workflow C (player-hull close-zoom detail) and D (sector moods): NOT started.

## The loop that worked (per body, serial; ~4 min a hull)
1. `"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --python tools/blender/forge/ships/<id>.py 2>&1 | grep -E "forge\]|Error|Trace"`
   — note the `tris=` BEFORE editing (for the report).
2. `SF_GL=d3d11 node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --name=<id> --views=close --out=.devshots/gfx-<id>`
   (`--views=place,close` for places). Open the PNG. The picture decides; green exit proves nothing.
3. Edit the recipe (band / box / boxes; one glow variant max per body, stock glows when close
   enough). Rebuild, reshoot, look. Two or three cycles.
4. Publish in ONE batch per sitting (steps 4–5 of publish dominate):
   `BLENDER="C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" node tools/blender/forge/publish.mjs a,b,c`
   Detach anything over ~8 min (`Start-Process node -ArgumentList "..." -RedirectStandardOutput log`);
   background shells die at 10 min.
5. Checks: `node scripts/check-parts-manifest.mjs`, `node scripts/check-render-package-pilots.mjs`,
   `node --test test/model-truth-census.test.mjs`.
6. Commit per body with pathspecs (recipe + `assets/ships/parts/<dir>/<file>.glb` +
   `assets/ships/release/parts/<dir>/<file>.glb`); the shared generated files
   (`assets/ships/parts/parts_manifest.json`, `assets/ships/release/release_manifest.json`,
   `assets/ships/release/render-packages/`, `assets/ships/render-packages/pilots.json`,
   `src/data/modelTruthCensus.json`, `src/render/renderPackageManifest.js`) ride on the last
   commit of the batch. Never `git add -A`; the tree carries other agents' live work.

## Landing on a diverged master without touching the dirty tree
Other agents commit locally on this checkout, so `master` is usually ahead AND behind. Do not pull.
```
git worktree add .worktrees/land origin/master          # inside the repo so node resolves modules
cd .worktrees/land && git cherry-pick -X theirs --no-edit <your shas>
cmd //c "mklink /J node_modules C:\Users\93rob\Documents\GitHub\SpaceFace\node_modules"
node tools/blender/forge/publish.mjs <all ids you published> --skip-blender   # regenerates manifests/packages/census
<the three checks>; git add -- src/render/renderPackageManifest.js assets/ships/release/render-packages ...; git commit
git push origin HEAD:master
cmd //c "rmdir node_modules"      # unlink the junction FIRST (rm -rf would follow it into the real node_modules)
cd ../.. && git worktree remove --force .worktrees/land; git worktree prune
```
If the worktree dir stays "busy", leave the empty folder; it is harmless.

## Traps met this sitting
- `publish.mjs` could not publish places after D94 (sg04 refuses place ids). Fixed on master
  (fabf94f98): places go through `scripts/build-place-release-assets.mjs --ids`.
- `band()` with the point outside the part cuts nothing and builds green. Along a port edge
  wound bow→stern with direction (dx,dy) the outboard normal is (dy,−dx)/L; step 0.2–0.3 m
  inboard. Never y-bound a `mirror=True` region.
- A lit colour on the same paint colour vanishes (yellow on hazard yellow). Put it on the dark.
- `helios_span_*` variants build over the CURRENT base recipe; their "before" tris equal the
  modified base. Before-counts: `git show HEAD:<recipe>` into a scratch dir with the kit path
  patched to `'..', '..'`, build, read `tris=`, delete the dir.
- `probe-frame-solid.mjs --compare` can run past 10 minutes and die silently in a background
  shell; run it in the foreground with the max timeout. Gate for this program: longest frame and
  p99 must not rise. Baseline json for this batch: `.devshots/frame-solid/2026-09-30T20-10-40-324Z.json`
  (p99 109.7 → 59.4 ms, longest 264 → 183 ms after the batch; `stuckMissing` and shader-link rows
  rose on wrecks/Mule/Atlas, which this work did not touch — unexplained, not cleared).
- Node packages vanished once (`node_modules` empty): `npm ci --no-audit --no-fund` (20 s).
