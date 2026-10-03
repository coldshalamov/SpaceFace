<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-10-03
baseCommit: 0d9dc433a
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
| Mission seam closeout — rows 85/86 via dispatched agent; D153 render-package staleness fixed (0d9dc433a); demo-readiness review arc + ledger adjudication + tree hygiene | devin-sweep-oct2 | IN PROGRESS | `src/systems/missions.js` + `src/data/missions.js` (agent hunks only), `design/program/DEMO_READINESS_2026-09-20.md` §6 rows as fixed, `design/program/NOW.md`, `build_map.md` §1C claims | land by pathspec in small packets after subagent review; never a dirty foreign hunk |
| Board row 218 (NXB-051 hull marks) plus free-seam leaves that do not overlap the sweep: stunt flail D144, SF-263 publish seam outside renderer.js; inference: field-cap notice, depot redirect, repair courier, salvage-bay tip | grok-oct3 | IN PROGRESS | `src/render/weapons/presenter.js`, `src/render/weapons/contactMarks.js`, `src/systems/stuntGrammar.js`, `src/combat/stuntEvidence.js`, `src/combat/stuntRecognition.js`, `src/systems/collisionConsequences.js`, `src/render/pipelineReadiness.js`, `src/render/renderPackageLoader.js`, `src/render/presentationPublisher.js`, `src/render/compilePresentSlice.js`, `src/systems/fields.js`, `src/systems/environmentalMachinery.js`, `src/systems/traffic.js`, `src/systems/worldSiteRuntime.js`, `src/systems/cargo.js`, `src/ui/hud.js` (salvage bay tip string only), `package.json` (probe:heap-verify, probe:main-thread, probe:crucible-cpu only), `docs/VALIDATION_WORKFLOW.md` (diagnostic probe sentence only), `test/fb-probe-doors.test.mjs`, `src/runtime/authoritativeSystemManifest.js` (swarmElites table-clock line only), `src/systems/scanner.js` (scan-pulse cooldown toast only), `test/infer-scan-pulse-cooldown.test.mjs`, `src/systems/cruise.js` (mass-lock toast only), `test/infer-cruise-masslock-toast.test.mjs`, `src/systems/cloak.js` (depleted toast only), `test/infer-cloak-depleted-toast.test.mjs`, `src/systems/routeFollower.js` (engage denial toasts only), `test/infer-route-engage-denied.test.mjs`, `src/systems/flightV3.js` (boost refusal toast only), `test/infer-boost-refusal-toast.test.mjs`, `src/systems/uniqueLootAbilities.js` (Pale Coil spent notice only), `test/infer-pale-coil-spent.test.mjs`, `src/systems/massSeed.js` (replacement toast only), `test/infer-mass-seed-replaced.test.mjs`, `src/systems/uniqueLootAbilities.js` (knitbots patch notice), `test/infer-knitbots-patch-toast.test.mjs`, `src/systems/heistFacilities.js` (capture refusal voice only), `test/infer-capture-refusal-voice.test.mjs`, `test/pq146-tether-physics.test.mjs` (run only), `test/next-wave-nxb-051.test.mjs`, new focused tests for these four inference units, `build_map.md` camera seam claim only | prove each leaf with a focused test; do not commit; do not revert foreign hunks |
| 30-unit sweep: seams picture (140 minus SF-263-in-grok-paths, 141, 259), boot 57, art 223, unblocked 142/170/224/227 — plus inference NXI-008/039/040/051/052/063/064/160/196/207/225/226/227/228 | devin-oct3-40 | IN PROGRESS | `src/render/renderer.js`, `src/render/{admissionSliceBudget,precompile,tabletopPolicy,lod,bloom,entityMeshVisibility,actionVfx}.js`, `src/render/materials*.js`, `src/render/thruster/**`, `src/core/{simulationRunner,perfRuntime,presentationRunner}.js`, `src/systems/{world,bombs,encounterScripts,precursorMachines,alienEcology,worldSiteKernel}.js`, `src/data/{precursorMachines,alienEcologyState,alienEcology,starterBuilds}.js`, `src/world/activityRuntime.js`, `src/ai/{squad,shipDecision,engagementAuthority}.js`, `src/core/flight/flightTelemetry.js`, `src/core/physicsAuthority.js`, `src/ui/powerRail.js`, `src/audio/cuePriorityBus.js`, Forge/asset files for row 223, new focused tests under `test/`, `build_map.md`, `design/program/NOW.md`, `design/program/INFERENCE_IDEAS.md` | dispatched subagents land by exact pathspec; never touch sweep/grok/oct2 hunks — cargo.js/traffic.js now grok-owned |
| INFERENCE 10 — brainstormed unscoped units, one production commit each: escort-the-tender activity, famous flagship transit lane contact, scavenger wreck contest, signal-hop mystery cache, planet-skim receipts, stations remember deeds, closing-speed honest damage, first-hour job fork, disabled-ship tow rescue, physics-kill news headlines | glm-infer-oct3 | IN PROGRESS | `src/data/encounters/*`, `src/systems/encounterDirector.js`, `src/data/laneContacts.js`, `src/systems/aftermathWrecks.js`, `src/data/uniqueWrecks.js`, `src/systems/stationContacts.js`, `src/systems/barkDirector.js`, `src/data/barks.js`, `src/combat/damage.js`, `src/systems/onboarding.js`, `src/systems/tetherGameplay.js`, `src/systems/planetRuntime.js`, `src/ui/marketNews.js`, `src/ui/dockArrival.js`, `src/ui/station/barContacts.js`, `src/data/worldOneOffs.js`, `src/systems/bulletTime.js`, `src/ui/screens/clips.js`, new focused tests under `test/`, checkpoint `.codex/agent-checkpoints/infer-10-oct3.json` | land each unit by exact pathspec with a focused test; recorded via inference-record; never touch oct2/grok/oct3-40 claimed hunks (no traffic.js/environmentalMachinery.js/fields.js/world.js/bombs.js/encounterScripts.js/weapons presenter) |
| 3 build map tasks (FB-059 heavy drives, FB-032 sector physical, FB-123 cue captions) + 3 INFERENCE tasks (PRO-12 release assist row, PIC-15 PD intercept vfx/cue, INST-17 jump arrival layer) | antigravity-oct3 | IN PROGRESS | `src/core/flight/propulsionCatalog.js`, `src/data/ships.js`, `src/data/sectorPhysical.js`, `src/data/sectorCompositions.js`, `src/ui/captions.js`, `src/ui/screens/settings.js`, `src/data/featureFlags.js`, `src/render/vfx/actionEventRecipes.js`, `src/systems/countermeasures.js`, `src/audio/audioSystem.js`, `src/data/audioRecipes.js`, new focused tests under `test/` | land by pathspec after subagent review |

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
