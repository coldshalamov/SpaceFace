<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-27
baseCommit: e0dd924dccbf97289bc3930dc7616be7b2a42648
expiresAfterCommits: 10
expiresAfterDays: 2
```

This is a short collaboration board, not a roadmap, backlog, completion ledger, or reason to stop
working. Product status and remaining tasks live in
[`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md) and
[`roadmap/program-queue.json`](./roadmap/program-queue.json).

## Rules

1. Add one row immediately before the first mutation. Reading, research, review, and tests reserve no
   file and need no row.
2. Name the exact task, thread label, current state, and files being changed now. Do not claim a
   subsystem, lane, tool, GPU, or future phase.
3. A row protects the exact dirty hunk from being overwritten. It does not block the task, packet, or
   other files. Work on disjoint hunks or another returned task while arranging an explicit handoff.
3a. **A row is a claim, not evidence — check liveness before yielding to it.** Run
   `node scripts/check-now-liveness.mjs`. A row whose claimed files are untouched for 90 minutes is
   **stale by definition**: the writer is dead or done. Adopt the work (evaluate the dirty diff,
   finish or land it, receipt it) and delete the row — do not route around it, do not wait, do not
   ask. Dirty files alone are never proof of a live writer in this chronically dirty tree, and
   "row exists + files dirty" is the claim verifying itself. Collisions here are cheap and
   recoverable; work stalled behind a ghost is invisible and permanent — yielding to a stale row
   is the failure mode, not the safe choice.
4. Reread a shared file before every patch. Release the row as soon as mutation stops.
5. Use `PUBLISHING` only for the brief stage/commit/push window. Stage only the task's exact files,
   verify the staged names, publish with `git commit -- <paths>` (a pathspec publish cannot race a
   snapshot), then remove the row. A staged deletion of a file that exists in `HEAD` and on disk
   means the shared index is stale, not that the file is gone: `git reset -- <paths>`, then publish.
6. End every task with `RESULT: DONE` or `RESULT: NOT DONE` using the template in
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md). Delete stale rows; Git and receipts own history.
7. Do not create a worktree by default. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| 15-task campaign T14: hauler cohort model repair (selection qty-match + pre-buy horizon check) | muse-campaign-15 | DONE 3e161c63d | src/balance/careerCohorts.js, scripts/check-career-earnings-benchmark.mjs, ledger D80+D81 rows (swept via e0dd924dc, D80 clause via d0a74e715 rider) | cohorts hauler -165/-70/-54→-3.6/+7.4/+12.7, earnings hauler -129.5→-5.8, hunter/courier 10/10 hold; review PASS after 2 hygiene fixes (D80 lane census 5/4, fixture refresh); residual → D80/D81 |
| 15-task campaign T15: ledger D81 earnings-hunter over-band triage | muse-campaign-15 | DONE 1233882c2 | scripts/check-career-earnings-benchmark.mjs, ledger D81 row (deleted via 6e630c59f sweep) | gate double-paid ambient bountyCr atop mission reward vs live AC-01/missionOwns law; killBonus→0 + audit field. Hunter 642.5→574.5 PASS (30m), 567.5 PASS (90m); hauler/prospector identical; review PASS |
| 15-task campaign T16: corridor harness crash on page-error verdict | muse-campaign-15 | DONE 605a36302 | scripts/check-gold-corridor-public-pilot.mjs | verdict .slice on issue object→.text; review PASS; hauler full PASS, masked errors were T17 streak spam |
| 15-task campaign T17: restore _spawnStationSideEventStreak forwarder | muse-campaign-15 | DONE 7b3d36aba (foreign landing, identical text) | src/render/vfx.js | diagnosed ce36f6f5f dangling ~19 NPC-job sites; my 7-line restore swept verbatim into 7b3d36aba; review PASS; 25/25 suites + corridor green |
| Graphics program: finish every GRAPHICS_PROGRAM.md backlog row (GFX-1, 3–14) | devin-graphics | IN PROGRESS | `tools/blender/forge/**`, `tools/art/render_hull_posters.mjs`, `scripts/fleet-look.mjs`, `scripts/flight-look.mjs`, `scripts/build-pack-release-assets.mjs`, `src/ui/hullPosters.js` (GFX-5), generated asset outputs via `publish.mjs` (`assets/ships/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_PROGRAM.md` | packet 1: env portability + GFX-6 kit helpers + GFX-13 wreck pack + GFX-1 trade hub; then GFX-3 place batches, GFX-4/7/8/14 bodies, GFX-9/10/11/12 runtime |
| Perf pipeline: plan + leaf implementation | devin-perf-pipeline | IN PROGRESS | `src/render/partsLibrary.js`, `src/render/assetResidency.js`, `src/render/hlod.js`, `src/render/asteroidInstancePool.js`, `src/render/renderPackageLoader.js`, `src/render/assetLoader.js`, `src/render/liveGeometryAdmission.js`, `src/render/bloom.js`, `src/render/vfx.js`, `src/render/renderer.js`, `src/world/farActorTable.js`, `src/core/perfRuntime.js`, `src/core/physics.js`, `src/data/modelTruth.js`, `src/audio/audioSystem.js`, `src/systems/bulletTime.js`, `src/systems/dockingCorridor.js`, `src/systems/drawFlightInput.js`, `src/systems/flight.js`, `src/systems/flightV3.js`, `src/systems/input.js`, `src/ui/{hud,bandHud,masslineHud,comms,survivalHud,floatingText,damageIndicators,capitalBossOverlayMount}.js`, `src/ui/views/hullIntegrity.js`, `electron/{main,preload}.cjs`, `scripts/probe-frame-solid.mjs`, `scripts/lib/gameServer.cjs`, `design/perf/PERF_MASTER_PLAN_2026-09-26.md`, `design/perf/PERF_METHODS_2026-09-26.md`, `design/program/NOW.md` | probe-route dependent: honest full-route run 06-06Z showed residual = saturated serial upgrade queue (28 pending); landed deep-queue pipeline-gate overlap + union projectile sweep + alloc-scratch/memo/latch batch + probe GC boundary + COOP/COEP + getAppMetrics witness |
| Build-map campaign: 10 tasks from open §22/§24 rows + planned units + ledger defects, review subagent per packet | devin-campaign-10 | IN PROGRESS | `scripts/probe-massline2-live.mjs` (live-route discrimination), `design/program/NOW.md` | landed: A6 slice green end-to-end 4b09b15a9 (magnet impulse + bootstrap parity), D75 re-pin af0b14682 (review PASS), D78 clause-seam c2a5d5244+a1891b924 (review PASS), PQ-207.03 9b29ce12c (100% blind readback), PQ-206.03 226dc276a (headed jitter measured honest, roles pinned), B3/B7/A2/B1/E6 verified + reviewed, pickup-VFX retarget 489e3ff32, PQ-146 escape-scene re-derivation 917e4bc42; D76 CLOSED — live probe 3fb01c70a green 13/13 at seed 47017 (probe-vs-authority repairs + PMREM sigma 0.02 ceiling fix; review PASS), D60 teleport trap armed 5 clean runs un-reproduced |
| Build-map 10-task campaign, third pass — all 10 tasks landed | devin-campaign-10c | DONE b62d4120e+c511bda8b | `design/program/NOW.md` | all 10 landed+pushed, each review-subagent verified: PQ-133.09 fbb89e8cb+fc8664995, E6 variety befda6f89+88c4a9c22, combat-actions-quiet-skip 2a71dc877+0f83e6c41, combat-prephysics-latch d1aaaace5+2b1874f53, combat-status-subsystem 8d192bfe1+419eb3209, combat-table-pose 39d58e4f5, volatile-index-cadence d75759b9e+821519097, fields-npc-plan-cadence 95501f84f+50298eba1, sensor-contact-scratch-fill b62d4120e, roster-retain-stable c511bda8b; every packet reviewed, sim hash clean throughout |
| A-list polish swarm: 6 disjoint lanes (predation authority, pilot memory, crime honesty, mission/salvage repair, cloak interplay, then wave-2 economy/world batch) | devin-alist-swarm | IN PROGRESS | `src/ai/engagementAuthority.js`, `src/systems/{encounterDirector,aceMemory,pirateDisengage,lawSecurity,factions,heat,scanner,world,economy,missions,salvage,survivorPod,cloak,aiPorts,weapons,countermeasures,automation,claims,economyContracts,gateControlDirector,sectorSim,traffic,asteroidFormations,survivalWave,combat}.js`, `src/sim/sector/embodiment.js`, `src/world/embodimentRecipes.js`, `src/save/saveSystem.js`, `src/data/{wreckMissions,narrative,mining,automation,modules,tech,enemies,combatDefs,swarmMode}.js`, `src/combat/{attachments,combatDoctrine}.js`, `src/ai/specialistPlans.js`, new sibling files under `src/ai/`+`src/data/`+`src/ui/prompts/` as needed. Verb-feel files (tetherGameplay/massline*/fields/stuntGrammar/onboarding) deferred — THE HAND lane owns them | wave-1 five lanes land by pathspec commit; then wave-2 economy/world/combat batch; then review pass + baseline |
| THE HAND lane session (first free lane per §2 order; MACHINE=perf, PICTURE=graphics claimed) — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | IN PROGRESS | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js`, `design/program/NOW.md` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path |
| FIGHT+WORLD agentic run: Bay 7 place+scan, Kurtz desk, presence services, adventure kill shards, throwable mines, thrown explosive fuse, memorial thief, Choir berth memory | cursor-fight-world-run | IN PROGRESS | `src/data/sectors.js`, `src/data/sectorAnchors.js`, `src/systems/story.js`, `src/ui/station/barContacts.js`, `src/ui/station/stationApp.js`, `src/ui/station/serviceQuotes.js`, `src/systems/aftermathWrecks.js`, `src/systems/mines.js`, `src/systems/lootShards.js`, `src/systems/uniqueWrecks.js`, `src/systems/memorialThief.js`, `src/data/worldOneOffs.js`, `test/helios-bay7-scan.test.mjs`, `test/kurtz-bar-desk.test.mjs`, `test/faction-presence-service-wire.test.mjs`, `test/adventure-kill-shard.test.mjs`, `test/seam-mines.test.mjs`, `test/thrown-explosive-proximity.test.mjs`, `test/memorial-thief.test.mjs`, `test/choir-berth-memory.test.mjs` | implement 8 player-visible slices; focused tests; no claimed HAND/MACHINE/PICTURE/alist paths |

## Remaster machine

The other computer does not share this checkout. It only adds finished files under
[`vm-drop/`](./vm-drop/README.md), on branch `vm-drop`, and the job list is
[`VM_LANES.md`](./VM_LANES.md). Local threads do not write in that folder. An empty table above
does not invite the other machine into `src/`.

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
