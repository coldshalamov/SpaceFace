<!-- LIFETIME: VOLATILE -->
# Orphan harvest ledger

```yaml
opened: 2026-08-17
playbook: design/program/ORPHAN_HARVEST_PLAYBOOK.md
status: open
```

This is the campaign checkpoint. A copy or unused model with no row is
still lost. Update the row when you classify, and again when you
MERGE / CHECKPOINT / DROP / ADAPT.

Dispositions and anti-loop rules live in the playbook, not here.

## Track C — 2026-08-31 active reconciliation

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| C-root-rover-promotion | current master working tree: combined `place_works_rover` source/release/package, manifests, Works wire | rejected promotion | DROP 2026-08-31 | The generated combined artifact repackages current-master Cycle 78 inputs; it has no distinct accepted art, no hash-bound Rover visual review, and the captured PQ-131.00 images prove `drill_platform`, not Rover. Runtime review found a duplicate-load race, shared material animation, inert bit socket, and invalid manifest claims. | Removed from the repository working tree; its four generated GLBs are recoverable in `C:\sf-agents\quarantine\rejected-root-rover-promotion-20260831` because direct deletion is safety-blocked. Review `codex/pq13101-rover-cycle79-sparse-20260826` as the separate newer Cycle 80 candidate. |
| C-root-authored-warmup | current master working tree: `src/render/partsLibrary.js`, `src/render/precompile.js` | refuted runtime warmup | DROP 2026-08-31 | The ordinary first post-opening pass would synchronously admit 14 release GLBs (154,900,800 bytes) beyond the Kestrel bootstrap contract and retain them for the renderer lifetime. | A future attempt needs a bounded sector set, sector-exit ownership release, and a started-library regression test before it can change live preload behavior. |
| C-root-vfx-and-diagnostics | current master working tree: plume scratch pool, runtime-witness flags, hillclimb note | partial investigation | ADAPT 2026-08-31 | Repeated plume bakes were byte-identical, but six scratch buffers stayed resident after final release and precompile retained a plume reference. The response-buffer observation is a lead, not a comparable hitch result: requested GC/census evidence can be absent while the probe exits green. | Drop the unsafe code and unsupported log entry. Re-open only as a bounded PQ-129 measurement task that proves lifecycle release, records diagnostic validity, and separates allocation totals from retained-heap deltas. |
| C-wt-massline-cycle36 | `C:\sf-agents\grok-pq04901-massline-builder-20260827` at `d38e05e7` | ported source candidate | DROP 2026-08-31 | `master` commit `2c8c3e4f` preserves the Cycle 36 source/evidence progression; its three source LOD hashes match the recovered candidate. The old release payload was independently classified ADAPT, so no stale package/map is carried forward. | Clear its stale NOW row, remove the registered worktree after this ledger commit is pushed, and retain no separate source checkout. |
| C-wt-works-source-bundle | source trees from `codex/canonical-integrate-20260829` and the nine PQ-131 builder worktrees | source-only port | PORT 2026-08-31 | `master` commit `b64bdd8d` preserves 1,080 files (about 1.26 GB) under the nine `assets/works/*` source/evidence trees. It changes no release manifest, package, runtime map, or renderer, so it carries no live/acceptance claim. | The independent builder reviews passed. Compare each source-tree blob set and remove redundant registered worktrees after this checkpoint is published. |
| C-wt-works-builders | nine `tools/blender/build_works_*.py` scripts from `codex/canonical-integrate-20260829` | authoring provenance | PORT 2026-08-31 | This checkpoint preserves all nine standalone Blender authoring tools. They are not executed, runtime imports, release wiring, or an acceptance claim; rebuilding could overwrite current runtime-facing works exports. | Keep them as source provenance only. Before any deliberate rebuild, adapt Conduit Kit's machine-local Blender 5.1 path and reconcile the output through the normal asset pipeline. |

## Track A — orphan copies (`C:\sf-agents`)

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| A-ac01 | `C:\sf-agents\ac01-kill-economy` | done | MERGE 2026-08-17 | Victim-scaled kill bursts + physical credit chips now on current owners. Surgical port; did not take their whole visualFactory. 24 focused tests green. | Keep worktree until pushed; then DROP the copy |
| A-ac02 | `C:\sf-agents\ac02-universal-vacuum` | superseded | DROP 2026-08-17 | Review: live mining already pulls every pickup with the same numbers. Tip is a rename/extract, not a missing feature. | Safe to delete clone |
| A-ac03 | `C:\sf-agents\ac03-kill-rp` | near-done | CHECKPOINT | Routes kills through RP writer; depends on `killRewards`. Leftover clone. | After AC-01 if that merges |
| A-ac04 | `C:\sf-agents\ac04-readable-tumble` | partial | CHECKPOINT | Tip edits live `tumbleStatus` / `tumbleStates`. Master already has tumble. | Diff tip vs current tumble; keep only unread consequences |
| A-ac05 | `C:\sf-agents\ac05-juice-discipline` | partial | CHECKPOINT | Leftover clone; 60 src files vs shared fork. | Extract tip-only juice rules; do not merge fork |
| A-ac06 | `C:\sf-agents\ac06-physics-arsenal` | done | MERGE 2026-08-17 | Gravity Mark now grabs light hulls; Well/Repulsor use combat mass scale. Review said merge. 31 field tests green. | Keep worktree until pushed |
| A-ac07 | `C:\sf-agents\ac07-massline-honesty` | superseded | DROP 2026-08-17 | Tip removes the 15% taut-sling flourish. Later master tests/probe/camera require that flourish. Opposing policy, not lost honesty. | Safe to delete worktree after receipt; do not port |
| A-ac08 | `C:\sf-agents\ac08-kill-causes` | near-done | CHECKPOINT | New `killCause.js` absent on master. Depends on AC-01 rewards. | After AC-01 |
| A-ac09 | `C:\sf-agents\ac09-death-signatures` | partial | CHECKPOINT | Edits live `vfx.js` / phased explosions. | Review vs current VFX owners; do not overwrite dirty VFX |
| A-ac10 | `C:\sf-agents\ac10-combat-pacing` | partial | CHECKPOINT 2026-08-17 | Unique, but a planner-bypass ambush that burns the day’s combat budget on islands that already have people. Review said do not port as-is. | Either add presence to empty belts, or shrink to no-presence belts and stay off the minor ledger |
| A-ac11 | `C:\sf-agents\ac11-starter-envkill` | partial | CHECKPOINT | Edits `newGameDefaults` / starter builds. | Review before touching starter |
| A-ac12 | `C:\sf-agents\ac12-vacuum-inhale` | near-done | CHECKPOINT | New `pickupCaptureWave.js` absent on master. | Review + port after mining-owner check |
| A-ac13 | `C:\sf-agents\ac13-planets` | junk | DROP 2026-08-17 | Tip is a copy of AC-12 inhale, not planets. | Delete when A-ac12 is harvested |
| A-ac13r | `C:\sf-agents\ac13-planets-reroute` | partial | CHECKPOINT | Planet runtime + planets data. Real planet plunge work. | Review vs current planetRuntime |
| A-ac14 | `C:\sf-agents\ac14-living-chain` | partial | CHECKPOINT | Ceres living ore chain; edits traffic/encounters. | Review vs PQ-048 live Ceres |
| A-ac15 | `C:\sf-agents\ac15-wing-cargo` | partial | CHECKPOINT | Wing morale cargo dump. Master already has wingMorale. | Diff tip vs current wingMorale |
| A-ac16 | `C:\sf-agents\ac16-mote-pack` | near-done | CHECKPOINT | Mote swarm encounter; new encounter file missing on master. | Review + port encounter |
| A-ac17 | `C:\sf-agents\ac17-force-legibility` | partial | CHECKPOINT | Hostile anchor snares; edits enemies + fields. | Review with A-ac06 |
| A-ac18 | `C:\sf-agents\ac18-damage-dressing` | near-done | CHECKPOINT | New `shipDamageDressing.js` absent on master. Quality-sensitive. | Visual review before wire |
| A-ac19 | `C:\sf-agents\ac19-market-continuity` | done | MERGE 2026-08-17 | Market re-rolls now lerp instead of snapping. Review said merge. 5 tests green. | Keep worktree until pushed |
| A-ac20 | `C:\sf-agents\ac20-wanted-lifecycle` | junk | DROP 2026-08-17 | Clone whose tip is a second copy of AC-03. | Delete with A-ac03 |
| A-ac-close | `C:\sf-agents\arcade-core-20` | junk | DROP 2026-08-17 | Tip is docs-only “campaign closed”. Packets live in A-ac01–19. | Delete after those rows are terminal |
| A-ac-husk | `C:\sf-agents\arcade-core-20-incomplete-20260815` | junk | DROP 2026-08-17 | Gitless partial factory-asset copy. No Hornet body. Not a source of unique ships. | Safe to delete folder |
| A-kestrel-audit | `C:\sf-agents\kestrel-a-list-audit` | junk | DROP 2026-08-17 | Empty leftover `.git` only. | Safe to delete folder |
| A-land | `C:\sf-agents\land-stale` | partial | CHECKPOINT | Menu polish on already-dirty UI files in the main tree. | Do not overwrite current UI dirty hunks |
| A-plan60 | `C:\sf-agents\plan60-kimi-review` | partial | CHECKPOINT | Whole new time-trial system + registry/save. Not a one-seam port. | Own packet; do not silent-merge |
| A-pr94 | `C:\sf-agents\pr94-policy-sparse` | partial | CHECKPOINT | Inference verification policy tip not in this master object db. | Compare to origin; not player models |
| A-pr95-ace | `C:\sf-agents\pr95-ace` | near-done | CHECKPOINT | Named ace escapes; new test absent. 2-file tip. | Review + port |
| A-pr95-all | `C:\sf-agents\pr95-all` | partial | CHECKPOINT | Wave-2 bundle, 13-file tip plus huge fork. | Split into leaf ports; do not merge branch |
| A-pr95-hud | `C:\sf-agents\pr95-hud` | partial | CHECKPOINT | Quiet combat HUD; collides with live HUD dirty hunks. | After HUD owners release those files |
| A-pr95-log | `C:\sf-agents\pr95-logistics` | near-done | CHECKPOINT | Dock-session market recovery. 5-file tip. | Review + port |
| A-pr95-mkt | `C:\sf-agents\pr95-market-qol` | junk | CHECKPOINT | Gitless leftover tree. Use A-pr95-log branch instead. | Delete after A-pr95-log harvested |
| A-pr95-skitter | `C:\sf-agents\pr95-skitter` | junk | CHECKPOINT | Gitless leftover; src hashes differ from main. Registered work is A-pr95-swarm. | Do not delete until swarm is harvested |
| A-pr95-swarm | `C:\sf-agents\pr95-swarmers` | near-done | CHECKPOINT | Distinct swarmer tells. 5-file tip. | Visual review + port |
| A-pr95-val | `C:\sf-agents\pr95-validation` | partial | CHECKPOINT | Validation battery / lab metrics. Support work. | Port only if it proves a production claim |
| A-basevis | `C:\sf-agents\baseline-vis` | junk | DROP 2026-08-17 | No longer in `git worktree list`. Gone. | None |

Refresh this table if `git worktree list` or `C:\sf-agents` gains or
loses a folder. Do not delete a row; mark `DROP` and date it.

## Track B — unused models in the main project

| id | source | class | disposition | player outcome | next |
|---|---|---|---|---|---|
| B-hitch-v9 | V9 Hitch source vs V7 compressed release | partial | CHECKPOINT 2026-08-17 | V9 extras exist in source only. Three still reviews all said do not rebuild the live compressed ship from this: toy antennas/orbs, mush stencil, lost name plate, fake greenhouse, slab trays. Live stays V7. | Next: another real Hitch polish pass, or strip the extras. Do not copy uncompressed V9 over release. |
| B-factory | `assets/ships/fleet_player_bodies_v1` | partial | CHECKPOINT 2026-08-17 | Hornet C52 review: open cage / tube+boxes, loses to Hitch, do not wire. Same factory method on the other ships. | PQ-050 form restart. Do not promote C52. Do not dump the factory folder. |
| B-traffic | `*_production_v1` traffic bodies | unused-below-bar | CHECKPOINT 2026-08-18 | Tried one role: `helios_lark_production_v1`. Three remaster stills exist. Compared to the live Lark target (`helios_lark_wholeship_selected.jpg`) it is a factory Cube/Cylinder loft, 1.4MB, no `spacefaceAsset`, no manifest/package. Live courier stays `helios_lark.glb`. Do not stamp a release row — that is how traffic went invisible last time. Same factory method on cradle/span/work-boat remasters. | Form remaster that beats the live target at three-quarter, then identity + package + load proof, then maybe remap one role |
| B-markings | `assets/ships/foundry/spacepunk_markings_v1` | done-unwired | CHECKPOINT 2026-08-18 | Atlas is finished authoring-only (32 cells, no KTX2, no GLB, no hull UVs). Live Hitch already has its own decal cards. Wiring this session would be a slap-on plane or a Hitch rebake. | Own packet: pick one family, map a small cell subset, KTX2, mip/alpha/bloom proof |
| B-ceres-props | Ceres render packages | near-done | CHECKPOINT 2026-08-17 | Packages exist in the generated manifest; not placed in world data. Main tree already dirty on those packages. | Place via place registration after that writer finishes; do not steal |
| B-liner | `assets/ships/massline_express_liner_v1` | partial | CHECKPOINT 2026-08-17 | Brief + donor only. No body. | PQ-049. Do not invent a liner to close this row |
| B-blocked-acc | `wholeships/pelican.glb`, `wasp.glb` | junk | DROP 2026-08-17 | Accessory-only, no hull. Already unwired on purpose. | Never wire |
| B-yard-16 | everyday production places ×16 | unused-below-bar | CHECKPOINT 2026-08-18 | Still panel: 2 of 3 said toy/open-cage/LEGO. Live remaps and Tethys buoys reverted. PLACE_FILES admission removed. Authored Ceres offsets stay on disk, unwired. | Remaster fittings until a 2–3 still panel leaves no blocking toy defect, then admit + spawn |
| B-lane-furniture | 6 Helios corridor props | partial | MERGE 2026-08-18 (subset) | Construction-repaired and released. Hash-bound still panel: 2/3 WIRE_ALL, 1 WIRE pin+locker only (LEGO-foot notes on the other four). Live admit is only `place_lane_pin` + `place_cold_locker`. Tally / claim / ash / whistle stay on disk. | Remake embed feet on the four held marks, then a new 2–3 panel with zero blocking LEGO notes |
| B-work-remainder | 7 occupational hulls | unused-below-bar | CHECKPOINT 2026-08-18 | Re-authored bodies exist. Still panel did not clear tanker/tug (missing-hull/LEGO), held prospector/cutter, finish-then-merge on lifter/sweeper. All seven unwired from traffic/hostile maps. Live four + Hornet/hauler/miner/express untouched. | Remake enclosed hulls, then a new 2–3 still panel with zero blocking notes |
| B-work-donors | construction_rig, ore_barge_b, salvage_cutter_damaged, volatiles_tanker_b | unused-below-bar | CHECKPOINT 2026-08-18 | No re-authored bodies. Source donors are primitive boxes/tubes. | Author enclosed hulls + release + package + role before any wire |

## Closeout

- [x] Every Track A row is MERGE, CHECKPOINT, DROP, or ADAPT
- [x] Every Track B row is MERGE, CHECKPOINT, DROP, or ADAPT
- [x] MERGE commits are on local master: AC-01 kill chips, AC-06 field mass, AC-19 market blend
- [ ] Those MERGE commits are not on origin — this checkout is behind remotes; push was rejected
- [x] Hitch later polish is NOT on the compressed live ship; B-hitch-v9 says why (toy extras)
- [ ] `C:\sf-agents` still holds the copies; do not delete until MERGE commits are pushed
- [x] Ledger is complete as a checkpoint. Remaining near-done units have a next action.
