<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-10-03
baseCommit: 7b4b36fe2bfaef527551f5955f8dde1470efb50c
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
| 20 board rows — seams economy (74/107/108/109/110/210/249/250), missions (83/84/85/86/222/254), drift 168/207/211, imports 30, accept 60/63/64 — plus inference NXI-176/084/099/216/043/175/148/180 + 2 picked at edit time; ALSO defect sweep D141/D142/D138 + people (201/212/213), swarm (264–268), ui-sim (197/246/276/277) via dispatched agents | devin-sweep-oct2 | IN PROGRESS | `src/systems/{economy,missions,stationServices,heat}.js`, `src/systems/contractClauses.js`, `src/systems/cargoCustody.js`, `src/ui/station/screens/market.js`, `src/ui/screens/drill.js`, `src/ui/watchlist.js`, `src/combat/impulseKernel.js`, `src/systems/npcJobs*.js`, `src/systems/convoy*.js`, `src/systems/survival*.js`, `src/systems/swarm*.js`, `src/data/swarm*.js`, `src/ui/localmap.js`, `src/ui/codex.js`, `src/ui/screens/contracts*.js`, `src/systems/lawSecurity.js` (D142 only), `test/d136-repro.mjs` (D141 only), new focused tests under `test/`, `build_map.md` §1C seam claims, `design/program/NOW.md`, `design/program/INFERENCE_IDEAS.md`, `design/program/DEMO_READINESS_2026-09-20.md` §6 rows as fixed, `design/program/vm-drop/` import sync for row 30 only | land by pathspec in small packets after subagent review; never a dirty foreign hunk |
| Board row 218 (NXB-051 hull marks) plus free-seam leaves that do not overlap the sweep: stunt flail D144, SF-263 publish seam outside renderer.js | grok-oct3 | IN PROGRESS | `src/render/weapons/presenter.js`, `src/render/weapons/contactMarks.js`, `src/systems/stuntGrammar.js`, `src/combat/stuntEvidence.js`, `src/combat/stuntRecognition.js`, `src/systems/collisionConsequences.js`, `src/render/pipelineReadiness.js`, `src/render/renderPackageLoader.js`, `src/render/presentationPublisher.js`, `src/render/compilePresentSlice.js`, `test/pq146-tether-physics.test.mjs` (run only), `test/next-wave-nxb-051.test.mjs`, `build_map.md` camera seam claim only | prove each leaf with a focused test; do not commit; do not revert foreign hunks |
| 30-unit sweep: seams picture (140 minus SF-263-in-grok-paths, 141, 259), boot 57, art 223, unblocked 142/170/224 — plus inference NXI-008/039/040/051/052/063/064/160/196/207 | devin-oct3-40 | IN PROGRESS | `src/render/renderer.js`, `src/render/{admissionSliceBudget,precompile,tabletopPolicy,lod,bloom,entityMeshVisibility,actionVfx}.js`, `src/render/materials*.js`, `src/core/{simulationRunner,perfRuntime,presentationRunner}.js`, `src/systems/{world,bombs,encounterScripts}.js`, `src/world/activityRuntime.js`, `src/ai/{squad,shipDecision,engagementAuthority}.js`, `src/core/flight/flightTelemetry.js`, `src/ui/powerRail.js`, `src/data/starterBuilds.js`, `src/audio/cuePriorityBus.js`, Forge/asset files for row 223, new focused tests under `test/`, `build_map.md`, `design/program/NOW.md`, `design/program/INFERENCE_IDEAS.md` | dispatched subagents land by exact pathspec; never touch sweep/grok/oct2 hunks |

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
