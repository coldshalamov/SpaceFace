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
| NXI-022 kinematic machine proxy not offered as a tow body (INFERENCE catalog) | glm-nxi022 | EDITING | `src/systems/tetherGameplay.js`, new focused test under `test/`, `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | land pathspec, mark catalog SHIPPED, release this row |
| §1C row 220 hand seam (SFQ-B021+SFQ-B025: latch eligibility honest + a fresh wreck latches) | glm-hand-220 | EDITING | `src/systems/tetherGameplay.js`, possibly `src/systems/terrainAnchors.js`/`src/systems/masslineImpacts.js`, new focused test under `test/`, `build_map.md`, `design/program/NOW.md` | land pathspec, delete board row 220, release this row |
| demo-5 board+3 inference: §1C row 217 NXB-050 chain readout (camera seam, folds NXI-197/198), row 260 FB-100 parity slice only (grok-demo-ship holds FB-099/126/105 hunks), row 262 corridor/wing closures, row 226 save boundary, row 143 SF-230 slice only (grok holds SF-227); NXI-108 economyCycles.js | devin-demo5 | EDITING | `src/render/{masslinePresentation,projectileMotionPresentation,camera}.js`, `src/ui/screens/settings.js`, `src/core/gameState.js`, `src/ui/hudLayout.js`, `src/systems/barkDirector.js`, `src/audio/environmentMix.js`, `src/data/audioRecipes.js`, `src/audio/audioSystem.js` (SF-230 hunk only), `src/systems/{dockingCorridor,wingmanRadial}.js`, `src/save/saveSystem.js` (disjoint hunk — grok owns ironman hunk), `src/core/runTransitionGuard.js`, `src/systems/economyCycles.js`, `test/*` focused, `build_map.md`, `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | land each row by pathspec, delete landed detail rows |
| PRO-08 touch overlay scale + layout (INFERENCE catalog PRO-08) | infer-pro08-touch | COMPLETE 3ce78b75f | `src/systems/touch.js`, `src/ui/screens/settings.js`, `src/save/saveSystem.js`, `test/pro-08-touch-overlay-config.test.mjs` | landed; row removable on next sweep |
| TEACH-06 field escape taught once on first capture | infer-teach06 | EDITING | `src/systems/onboarding.js`, `test/teach-06-field-escape-hint.test.mjs`, `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | land pathspec and delete this row |
| Graphics assessment implementation (design/program/GRAPHICS_ASSESSMENT_2026-09-28.md, all sections) | devin-graphics | IN PROGRESS | `src/render/{bloom,renderer,infrastructureMotion,visualOverrides,vfx}.js`, `src/data/sectorVisualProfiles.js`, `tools/blender/**`, `scripts/{fleet-look,flight-look}.mjs`, generated asset outputs via publish (`assets/ships/**`, `assets/incubator/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_ASSESSMENT_2026-09-28.md` | packet A bugs (D97 corner picture, rest-state glow disc, Wreck Cathedral scale, D72 check) → B lighting/surface + C station animation (one fleet republish) → D composition → E models → F effects |
| THE HAND lane session — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | STALE — adoptable (~2h) | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path. Open ledger rows in this area at the time the writer went quiet: D87 (fields runtime-profile guard), D88 (tether:cutDenied no subscriber) |
| 10-unit inference/build batch — COMPLETE 10/10 (LAW-01 9f3b29c81, LAW-02 5b134a757, LAW-07 7bab8efef, LAW-05 cb7ad8d5d, LAW-08 dfe87b17e, VERB-29 5940b3576, FIGHT-06 3a23b384a, INST-18 0b1e0e3f3, WORLD-28 12231fdcf, WORLD-23 2f9824d74) | devin-10units | COMPLETE | `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | batch finished; row retained for the ledger, removable on next sweep |




| Demo shipping — screen shake, focus-loss hold, ironman latch, engine effort, pointer release, unknown price, refused fit, missing convoy price | grok-demo-ship | EDITING | `src/render/feel.js`, `src/render/camera.js`, `src/core/gameState.js`, `src/core/focusLossHold.js`, `src/core/presentationRunner.js`, `src/audio/audioSystem.js`, `src/audio/elementaryVoices.js`, `src/ui/screens/settings.js`, `src/save/ironmanChoice.js`, `src/save/saveSystem.js`, `src/systems/input.js`, `src/systems/ships.js`, `src/systems/claims.js`, `src/ui/station/screens/shipworks.js`, `src/ui/market/tradeLogic.js`, `src/ui/marketIntelligence.js`, `test/fb-099-screen-shake.test.mjs`, `test/fb-126-focus-loss.test.mjs`, `test/fb-105-ironman-choice.test.mjs`, `test/sf-227-engine-effort.test.mjs`, `test/sf-276-pointer-release.test.mjs`, `test/nxi-101-unknown-price.test.mjs`, `test/nxi-114-refused-fit.test.mjs`, `test/nxi-133-missing-convoy-price.test.mjs`, `build_map.md`, `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | land pathspec and delete this row |
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
