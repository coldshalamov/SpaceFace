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
| PIC-17 detonator dart detonation drives the detonator_run commit beat | goal-pic-17 | EDITING | `src/systems/impulseCharges.js`, `src/presentation/combatChoreography.js`, `src/presentation/cueRecipes.js`, `test/detonator-dart.test.mjs` | land pathspec, mark SHIPPED, delete this row |
| NXB-053 station navigation — one selected lot and one pending purchase | goal-nxb-053 | EDITING | `src/ui/station/screens/market.js`, `src/ui/station/screens/shipworks.js`, `src/ui/outfittingSpendConfirm.js`, `src/ui/input.js`, `src/systems/ships.js`, `test/next-wave-nxb-053.test.mjs`, `build_map.md`, `design/program/INFERENCE_IDEAS.md` | land pathspec and delete this row |
| Graphics assessment implementation (design/program/GRAPHICS_ASSESSMENT_2026-09-28.md, all sections) | devin-graphics | IN PROGRESS | `src/render/{bloom,renderer,infrastructureMotion,visualOverrides,vfx}.js`, `src/data/sectorVisualProfiles.js`, `tools/blender/**`, `scripts/{fleet-look,flight-look}.mjs`, generated asset outputs via publish (`assets/ships/**`, `assets/incubator/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_ASSESSMENT_2026-09-28.md` | packet A bugs (D97 corner picture, rest-state glow disc, Wreck Cathedral scale, D72 check) → B lighting/surface + C station animation (one fleet republish) → D composition → E models → F effects |
| THE HAND lane session — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | STALE — adoptable (~2h) | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path. Open ledger rows in this area at the time the writer went quiet: D87 (fields runtime-profile guard), D88 (tether:cutDenied no subscriber) |
| 10-unit inference/build batch — units 1-3 landed (LAW-01 9f3b29c81, LAW-02 5b134a757, LAW-07 7bab8efef); selecting unit 4 | devin-10units | LIVE | `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` (+ next unit's paths once chosen) | pick next catalog/board unit, claim, implement, land pathspec |

| pb-ten-lanes workflow — ten §1C board rows (54, 59, 72, 73, 81, 87, 88, 93, 95, 102 claimed; 80 PB-SLICE-E vetoed — live foreign writer on scanner.js/ambushSignatures.js) | pb-ten-lanes | LIVE (claimed 2026-09-28) | `src/systems/traffic.js`, `src/systems/npcJobs.js`, `src/systems/npcJobsRuntime.js`, `src/systems/world.js`, `src/data/sectorActivityPockets.js`, `src/data/laneContacts.js`, `src/systems/cargoCustody.js`, `src/ai/ambientPredation.js`, `src/systems/missions.js`, `src/data/environmentalMachinery.js`, `src/systems/environmentalMachinery.js`, `src/systems/aftermathWrecks.js`, `src/systems/encounterDirector.js`, `src/systems/encounterScripts.js`, `src/systems/salvageActions.js`, `src/data/encounters/346-yard-towout.js`, `src/systems/presentationOrchestrator.js`, `src/systems/stationContacts.js`, `src/systems/worldSiteRuntime.js`, `src/systems/scanReveal.js`, `src/systems/economy.js`, `src/systems/lossLedger.js`, `src/systems/onboarding.js`, `src/ai/director.js`, `src/audio/cuePriorityBus.js`, `src/render/cameraDirector.js`, `src/systems/swarmArena.js`, `src/data/swarmMode.js`, `src/systems/survivalRun.js`, `src/systems/survivalWave.js`, `src/systems/survivalWavePlanner.js`, `src/systems/runSession.js`, `src/ai/specialistPlans.js`, `src/ai/specialistCounterplay.js`, `src/systems/tacticalAI.js`, `src/ai/engagementAuthority.js`, `src/ai/maneuver.js`, `src/ai/shipDecision.js`, `src/systems/aiPorts.js`, `src/data/enemies.js`, `src/systems/bombs.js`, `src/data/bombs.js`, `src/systems/weapons.js`, `src/systems/fields.js`, `src/render/bombPresentation.js`, `src/core/fields/fieldKernel.js`, `src/systems/mines.js`, `src/data/opticStructures.js`, `test/*` new focused tests, new optic-cost probe under `scripts/`, new receipt under `design/program/roadmap/receipts/`, `build_map.md` §1C rows 54/59/72/73/81/87/88/93/95/102, `design/program/NOW.md` | land rows by pathspec, delete landed board rows, release this row |

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
