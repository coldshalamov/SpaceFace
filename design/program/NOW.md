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
| Board §1C row 26 VM-LATCH-E — quiet-latch render/sim wave E vm-drop imports | devin-w3-vm-latche | LIVE | `src/render/vfx.js`, `src/render/statusAttachedVfx.js`, `src/render/shipPitchPresentation.js`, `src/render/feel.js`, `src/systems/countermeasures.js`, `src/systems/pirateDisengage.js`, `src/systems/pirateParley.js`, `src/systems/salvageActions.js`, `src/systems/tacticalAI.js`, `src/systems/tumbleStates.js`, `src/combat/impulseKernel.js`, `src/systems/npcJobsRuntime.js`, `test/*-quiet-*.test.mjs` (new), `design/program/vm-drop/IMPORT_DIGEST/report.md`, `build_map.md` §1C row 26 | apply remaining quiet-latch patches by pathspec commit, ledger at top of digest, delete row 26 + this row |
| Graphics program: finish every GRAPHICS_PROGRAM.md backlog row (GFX-1, 3–14) | devin-graphics | LIVE (verified 2026-09-27) | `tools/blender/forge/**`, `tools/art/render_hull_posters.mjs`, `scripts/fleet-look.mjs`, `scripts/flight-look.mjs`, `scripts/build-pack-release-assets.mjs`, `src/ui/hullPosters.js` (GFX-5), generated asset outputs via `publish.mjs` (`assets/ships/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_PROGRAM.md` | packet 1: env portability + GFX-6 kit helpers + GFX-13 wreck pack + GFX-1 trade hub; then GFX-3 place batches, GFX-4/7/8/14 bodies, GFX-9/10/11/12 runtime |
| THE HAND lane session — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | STALE — adoptable (~2h) | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path. Open ledger rows in this area at the time the writer went quiet: D87 (fields runtime-profile guard), D88 (tether:cutDenied no subscriber) |
| Board §1C rows 44/46/48 — CV-DAY-1 Helios activity pockets + CV-QUIET-1 detour texture + CR-FEED-1 sector kill machines; plus 3 INFERENCE look-then-rotate units | devin-boards-3x3 | STALE — adoptable (claimed files untouched 18h+, liveness 2026-09-28) | `src/data/sectorActivityPockets.js`, `src/data/environmentalMachinery.js`, `src/data/sectors.js`, `src/data/laneContacts.js`, `src/data/stationSideEvents.js`, `src/systems/traffic.js`, `src/systems/npcJobs.js`, `src/systems/world.js`, `test/*` new focused tests, `build_map.md` §1C rows 44/46/48, `design/program/NOW.md`, `design/program/inference-memory.json` | build 3 board rows → prove each on fixed seed → pathspec commit → delete rows; then 3 INFERENCE units → inference-record; delete this row |
| Board §1C row 27 VM-SKIPS — import remaining vm-drop skip-class packages (~20: distortion/hull-scorch/camera-clearance/persistent-beams/sprites/swing-trace etc.) | devin-w3-vm-skips | LIVE | `src/render/renderer.js`, `src/render/vfx.js`, `src/render/presentationWorld.js`, `src/render/shipMicroMotion.js`, `src/render/shipPitchPresentation.js`, `src/render/shadowCasterPolicy.js`, `src/render/combat/arcadeStructuralFx.js`, `src/render/combat/persistentBeams.js`, `src/render/combat/phasedExplosions.js`, `src/render/weapons/distortionField.js`, `src/render/weapons/presenter.js`, `src/render/weapons/contactMarks.js`, `src/render/thruster/systems/plasmaStream.js`, `src/render/thruster/systems/rcsImpulse.js`, `src/combat/stuntFlightEvidence.js`, `test/*` new focused tests, `design/program/NOW.md`, `design/program/vm-drop/IMPORT_DIGEST/report.md`, `build_map.md` §1C row 27 | apply each folder's patches in order → focused test → pathspec commit per package/group → ledger section → delete row 27 + this row |


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
