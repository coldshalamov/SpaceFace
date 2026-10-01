# Handoff — GFX light-upgrades (lit identity trims and lit structures), 2026-10-01

Goal prompt: the four-workflow "make SpaceFace look great with graphics work that costs the frame
nothing" brief (lit trims on NPC hulls; lit structures on places; close-zoom hero detail on player
hulls; sector mood pass). This file says exactly what is DONE on `origin/master`, what is NOT, and
the recipe that worked, so the next agent starts at the first open body and not at the reading list.

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
