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
| Graphics assessment implementation (design/program/GRAPHICS_ASSESSMENT_2026-09-28.md, all sections) | devin-graphics | IN PROGRESS | `src/render/{bloom,renderer,infrastructureMotion,visualOverrides,vfx}.js`, `src/data/sectorVisualProfiles.js`, `tools/blender/**`, `scripts/{fleet-look,flight-look}.mjs`, generated asset outputs via publish (`assets/ships/**`, `assets/incubator/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_ASSESSMENT_2026-09-28.md` | packet A bugs (D97 corner picture, rest-state glow disc, Wreck Cathedral scale, D72 check) → B lighting/surface + C station animation (one fleet republish) → D composition → E models → F effects |


| pb-ten-lanes workflow — ten §1C board rows (54, 59, 72, 73, 81, 87, 88, 93, 95, 102 claimed; 80 PB-SLICE-E vetoed — live foreign writer on scanner.js/ambushSignatures.js) | pb-ten-lanes | LIVE (claimed 2026-09-28) | `src/systems/traffic.js`, `src/systems/npcJobs.js`, `src/systems/npcJobsRuntime.js`, `src/systems/world.js`, `src/data/sectorActivityPockets.js`, `src/data/laneContacts.js`, `src/systems/cargoCustody.js`, `src/ai/ambientPredation.js`, `src/systems/missions.js`, `src/data/environmentalMachinery.js`, `src/systems/environmentalMachinery.js`, `src/systems/aftermathWrecks.js`, `src/systems/encounterDirector.js`, `src/systems/encounterScripts.js`, `src/systems/salvageActions.js`, `src/data/encounters/346-yard-towout.js`, `src/systems/presentationOrchestrator.js`, `src/systems/stationContacts.js`, `src/systems/worldSiteRuntime.js`, `src/systems/scanReveal.js`, `src/systems/economy.js`, `src/systems/lossLedger.js`, `src/systems/onboarding.js`, `src/ai/director.js`, `src/audio/cuePriorityBus.js`, `src/render/cameraDirector.js`, `src/systems/swarmArena.js`, `src/data/swarmMode.js`, `src/systems/survivalRun.js`, `src/systems/survivalWave.js`, `src/systems/survivalWavePlanner.js`, `src/systems/runSession.js`, `src/ai/specialistPlans.js`, `src/ai/specialistCounterplay.js`, `src/systems/tacticalAI.js`, `src/ai/engagementAuthority.js`, `src/ai/maneuver.js`, `src/ai/shipDecision.js`, `src/systems/aiPorts.js`, `src/data/enemies.js`, `src/systems/bombs.js`, `src/data/bombs.js`, `src/systems/weapons.js`, `src/systems/fields.js`, `src/render/bombPresentation.js`, `src/core/fields/fieldKernel.js`, `src/systems/mines.js`, `src/data/opticStructures.js`, `test/*` new focused tests, new optic-cost probe under `scripts/`, new receipt under `design/program/roadmap/receipts/`, `build_map.md` §1C rows 54/59/72/73/81/87/88/93/95/102, `design/program/NOW.md` | land rows by pathspec, delete landed board rows, release this row |
| 20 board rows (audio 144/145/146/256, discovery 125–130, industry 112–116/182/198/205, fields 94, world 242) + inference PIC-21, WORLD-34, ECON-02, FIGHT-09, NXI-057, WORLD-36, NXI-018, NXI-061, NXI-037, NXI-041 | grok-board-20 | IN PROGRESS | `src/audio/audioSystem.js`, `src/audio/combatVerbCues.js`, `src/data/audioRecipes.js`, `src/systems/scanner.js`, `src/systems/scanReveal.js`, `src/systems/worldSiteRuntime.js`, `src/systems/fields.js`, `src/data/sectors.js`, `src/systems/traffic.js`, `src/render/vfx/worldCueRecipes.js`, `src/systems/lossLedger.js`, `src/ui/station/barContacts.js`, `src/systems/missions.js` (ECON-02 grant path only), `src/data/researchGrants.js`, `src/ai/specialistCounterplay.js`, `src/ui/threatHalo.js`, `src/ai/maneuver.js`, `src/systems/encounterScripts.js`, `src/systems/encounterDirector.js`, `src/systems/weapons.js` (NXI-061 only), `src/systems/bombs.js` (NXI-037/041 only), new focused tests under `test/`, `build_map.md` seam claims audio/discovery/industry/fields/world only | land by pathspec after review; do not touch devin-oct2-batch or zai-board20 paths |
| 20 board rows + 10 inference lines — seams save/ship/law/story/input/physics | devin-oct2-batch | IN PROGRESS | `src/save/**`, `src/systems/{ships,claims,lawSecurity,story,input,gamepad}.js`, `src/data/{ships,modules,techVerbLadder,shipCapabilities,shipLedger}.js`, `src/story/**`, `src/core/{physics,periodicClock,runtimeWitness}.js`, `src/runtime/authoritativeSystemManifest.js`, `src/render/snapshotFence.js`, per-inference exact files rowed at edit time (disjoint hunks only), `test/*` new focused tests, `design/program/roadmap/receipts/` new receipts, `build_map.md` §1C claimed rows, `design/program/NOW.md`, `design/program/INFERENCE_IDEAS.md` | land rows by pathspec, delete landed board rows, mark inference lines SHIPPED, release claims |
| 20 board rows — picture 31/32/39/45/75/139/140/141/259, boot 33/34/57/225, effects 131/132/133/134/193/230/255 — plus inference PIC-25, WORLD-21, WORLD-30, WORLD-32, WORLD-35, WORLD-39, WORLD-41, WORLD-42, TEACH-07, TEACH-08 | grok-build20 | IN PROGRESS | `src/render/renderer.js`, `src/render/asteroidInstancePool.js`, `src/render/assetResidency.js`, `src/render/resourceGovernor.js`, `src/render/pipelineAutoFlushPolicy.js`, boot owners that are not bloom/save/audio (`src/boot/**`, `src/core/precompile.js` only if present), `src/render/vfx.js`, `src/render/vfx/**`, `src/data/vfxProfiles.js`, `src/presentation/causalVfxGrammar.js`, `src/systems/automation.js`, `src/systems/barkDirector.js`, `src/data/barks.js`, `src/render/npcJobSignatureVfx.js`, `src/ui/station/barContacts.js`, `src/ui/dockArrival.js`, `src/combat/playerDefeat.js`, `src/ui/screens/gameOver.js`, `src/ui/galaxyMap.js` (marker model only), new focused tests under `test/`, new receipts under `design/program/roadmap/receipts/` | land by pathspec after review; do not edit other agents' files |

| 20 board rows — hand 104/105/175/199/219/229/236/239, camera 58/135/136/137/138/257, ui-sim 147/148/149/261, people 111/121 — plus 10 inference lines on clean files only (NXI-053/058/102/106/109/110/145/146/157/169 candidates; disjoint hunks, never a dirty foreign hunk) | zai-board20 | IN PROGRESS | `src/systems/{flightV3,tetherGameplay,massSeed,masslineControlLaw,masslineSnares,masslineHud,jettisonImpulse,camera,tabletopPolicy,crucible,choirReliefBerth,dynamicFlightStick}.js`, `src/core/flight/**`, `src/ui/{localmap,codex,achievements}.js` sim halves + `src/systems/achievements.js`, electron main shell, `design/program/vm-drop/**` import sync if taken, `test/*` new focused tests, `build_map.md` §1C claimed rows, `design/program/NOW.md`, `design/program/INFERENCE_IDEAS.md` | land rows by pathspec in small packets after review, delete landed board rows, set seams free/done, mark inference lines SHIPPED, release row |

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
