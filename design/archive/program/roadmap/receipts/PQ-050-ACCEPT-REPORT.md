<!-- LIFETIME: RECEIPT -->
# PQ-050.01–.22 — Fleet remaster acceptance (build_map row 60)

Accept-seam judgment, 2026-10-03. Bar per leaf (`roadmap/active/PQ-050.md` "Done when"):
forge `.py` source + published GLB; looked at in `scripts/fleet-look.mjs` (inspect/close/top)
and, for player hulls, `scripts/flight-look.mjs --ship=<def>` — nothing obviously wrong at
chase or close zoom, holds its own next to Hitch and Hornet; routing/package/manifest gates
green. Prior vm-drop chase candidates all recorded REVISE — those were pre-merge bodies; the
current forge-v1 bodies are what is judged here.

## Evidence

- `node scripts/fleet-look.mjs` per body — chase (the shipping camera crop), close, inspect,
  top. Frames: `.devshots/accept-fleet/` (player hulls, Ashline, lark — 2026-10-03 11:2x),
  `.devshots/accept-roles/` and `.devshots/accept-pq050b/` (traffic + Ashline detail —
  2026-10-03 12:1x–13:0x), all on current master.
- `node scripts/flight-look.mjs --ship=<def> --zooms=144` for the twelve player hulls —
  `.devshots/accept-flight/<hull>/flight_z144.png`, 2026-10-03. In-world, live admission path.
- Gates, all green on this tree today: `scripts/check-parts-manifest.mjs` — **6187 ok, 0
  fail, 841 diagnostics**; `test/fleet-player-wholeship-routing` — **PASS**;
  `test/fleet-npc-wholeship-routing` — **PASS**; `test/live-ship-visual-package-coverage` —
  **7/7 PASS**. (Earlier today the routing/coverage gates were un-runnable while a foreign
  SWARM-06 registry hunk lacked its clock declaration; the conflict fix `4493f299e` landed
  and all gates now pass.)
- Forge sources: all 22 `tools/blender/forge/ships/<ship>.py` present; 54 release GLBs under
  `assets/ships/release/parts/wholeships/` for the 22 bodies.

## Verdicts at the shipping camera

| Leaf | Body | Verdict | Read |
|---|---|---|---|
| .01 | Hornet | KEEP | Yellow-jacket cranked delta, flap row, tip cannon pods — the reference-quality fighter. |
| .02 | Drifter | KEEP | Teal multirole, amber canopy band, spine cargo pod. Dark at chase but silhouette + canopy read. |
| .03 | Ranger | KEEP | Gull-wing explorer, long sensor nose, swept boom pods — reads "scout". |
| .04 | Ironback | KEEP | Armoured slab barge, orange-striped bay rows — mass reads instantly, in-flight too. |
| .05 | Bastion | KEEP | Red-lit warship wedge — compact brawler read, distinct from warden's long gunship. |
| .06 | Atlas | KEEP | Boxy spine with orange container bays — bulk freight reads at a glance, in-flight too. |
| .07 | Warden | KEEP | Gunmetal gunship: dorsal tower, casemate rows, tri-drive transom — warship, in-flight too. |
| .08 | Colossus | KEEP | Massive capital slab: side trenches, porthole rows, outrigger blocks — mass communicated. |
| .09 | Leviathan | KEEP | White flagship: layered decks, flank stripes, ventral hangar — the fleet's crown. |
| .10 | Pelican | KEEP | Small miner, glowing amber scoop/hopper nose — job reads at any zoom, in-flight too. |
| .11 | Mule | KEEP | White hauler, two rows of green deck crates — cargo literally on the body, in-flight too. |
| .12 | Wasp | KEEP | Dark delta fighter, cyan light strips — the strips carry identity at chase. |
| .13 | Ashline dart | KEEP | Needle dart, hot orange dorsal blade — hostile signature survives chase compression. |
| .14 | Ashline lode | KEEP | Red-armoured bruiser wedge, hazard chevrons, twin prongs — heavy hostile read. |
| .15 | Ashline rig | KEEP | Long skeletal spine, twin claw bow, transom drives — the reaver silhouette. |
| .16 | Helios lark | KEEP | Ivory needle courier, teal band, swept pod drives, parcel rack — "express" reads. |
| .17 | Helios cradle | KEEP | Extraction arms around an open ore hopper — mining rig unmistakable at inspect. |
| .18 | Helios span | KEEP | Flatbed spine, three panel-topped cargo bays — freight hauler. |
| .19 | Ore barge | KEEP | Open ore cradles with visible rock load on a long barge — ore carrier. |
| .20 | Repair tender | KEEP | Twin yellow articulated welding booms reaching forward — the tender's whole job. |
| .21 | Salvage cutter | KEEP | Amber shear jaw + scrap cage aft — the salvor reads at inspect and chase. |
| .22 | Survey pin | KEEP | Slender hull, forward pin/dish boom on a dorsal dome — the surveyor's unique outline. |

**22 / 22 KEEP. 0 REVISE.** The current bodies hold up next to Hornet at the shipping camera:
distinct plan silhouettes, three-value paint with one identity colour, layered construction,
lights, manufactured surfaces. Nothing toy-like, nothing floating, nothing bolted on.

## Flight-look notes (honest)

- **All twelve player hulls resolved `state: authored` in-world** with real
  `LOD0_*`-named authored meshes and lit frames: ironback, colossus, leviathan, pelican,
  mule, atlas, drifter, ranger, bastion + kestrel (reference) in `.devshots/accept-flight/`;
  hornet, warden, wasp on `--wait=90` re-shots (`hornet-r2`, `warden-r2`, `wasp-r2/` —
  `LOD0_MOTION_HORNET_*` / `LOD0_MOTION_WASP_*` authored meshes present, identity liveries
  in frame). One wasp boot attempt timed out on `SF.state` under host contention (env, not
  the body); the retry resolved cleanly.
- First-pass frames raced swap-triggered authored admission on this saturated software-GL
  host — flat marker diamond or `loading`/`compiling-pipelines` beside the spawn worklight
  tower. That is the already-open §25 admission-throughput item — not a body defect.
- During the hornet re-shots the console logged `exact-target admission touch failed
  TypeError` inside `uploadTexture` on the CPU-detached shared `forge_panel_albedo`
  texture — a per-admission presentation hitch, not a crash. Logged as new defect row
  **D150** in `DEMO_READINESS_2026-09-20.md` §6 (third fingerprint on the D102 surface).
- Spawn-adjacent worklight tower photobombs the parked shot for several hulls; the bodies
  read through/around it.

## Verdict

All 22 leaves judged KEEP on current bodies at the shipping camera. Queue leaves flipped to
`done` on the strength of: authored GLBs proven through the live renderer (fleet-look
chase/close/inspect/top per body), all 12 player hulls additionally proven in-world
(flight-look `state: authored`, authored `LOD0_*` meshes verified per capture), all four
gates green on this tree (parts-manifest 6187 ok, player + NPC wholeship routing PASS,
live-ship package coverage 7/7), forge sources + release GLBs verified.
