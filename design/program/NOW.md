<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-03
baseCommit: 583f9dd8efdc560b63917a919ca725d44be4d90a
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
   verify the staged names, publish, then remove the row.
6. End every task with `RESULT: DONE` or `RESULT: NOT DONE` using the template in
   [`02_REMAINING_WORK.md`](./02_REMAINING_WORK.md). Delete stale rows; Git and receipts own history.
7. Do not create a worktree by default. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| PQ-137.10/.03/.08 FLIGHT lane (fun-loop campaign) | fable-master/lane-flight | MUTATING 2026-09-03 | `src/core/flight/`, `src/systems/flightV3.js`, `src/render/camera.js`, `src/render/velocityLanguage.js`, `src/data/ships.js`, `src/combat/autoTargetMode.js`, `test/flightV3.spec.mjs`, `test/travel-drive.test.mjs`, `test/auto-target-path*.test.mjs`, `scripts/lib/bench/flightBench.mjs`, `scripts/lib/bench/scenarios/feel.{reversal_course,screen_crossing,earned_speed_kept}.mjs` | bars B2/B3 measured then met → review → commit per leaf → master pushes |
| PQ-137.10/.04/.05 FORCE lane (fun-loop campaign) | fable-master/lane-force | MUTATING 2026-09-03 | `src/combat/impulseKernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`, `src/data/weapons.js`, `src/systems/impulseCharges.js`, `src/systems/tumbleStates.js`, `src/systems/aiPorts.js`, `src/data/combatLabSetups.js`, `test/weapon-*.test.mjs` (not -consequence), `scripts/lib/bench/scenarios/feel.hitstun_curve.mjs` | B11 curve then law → B4/B5 met → commit per leaf |
| PQ-137.11/.06/.07 CONTACT lane (fun-loop campaign) | fable-master/lane-contact | MUTATING 2026-09-03 | `src/core/sg02DynamicBodyOwner.js`, `src/systems/collisionConsequences.js`, `src/systems/tetherGameplay.js`, `src/systems/motionTelemetry.js`, `test/weapon-impulse-consequence.test.mjs`, `scripts/lib/bench/knockModel.mjs`, `scripts/lib/bench/scenarios/feel.knock_budget_10min.mjs` | B13 measured on the real path then met → B6 heavy clause → B7 → commit per leaf |
| PQ-139.00–.05 IMPACT lane (fun-loop campaign) | fable-master/lane-impact | MUTATING 2026-09-03 | `src/render/feel.js`, `src/core/timeEffects.js`, `src/render/masslinePresentation.js`, `src/audio/`, `src/render/vfx.js`, `src/vfxnext/`, `src/render/shipPitchPresentation.js`, `src/render/post/spaceRenderGraph.js`, `src/render/weapons/presenter.js`, `src/systems/fields.js` (presentation hook only) | hitstop/trauma by momentum with frames → sound by mass → commit per leaf |
| PQ-138.00–.04 WORLD lane (fun-loop campaign) | fable-master/lane-world | MUTATING 2026-09-03 | `src/systems/lawSecurity.js`, `src/systems/traffic.js`, `src/systems/survivorPod.js`, `src/systems/encounterScripts.js`, `src/systems/aftermathWrecks.js`, `src/systems/missions.js`, `src/systems/contractClauses.js`, `scripts/lib/bench/scenarios/world.reaction_trio.mjs` | three listeners on the route (B10) → wrecks keep momentum → failure mutates → commit per leaf |
| PQ-173.00 repair (headless) BENCH lane (fun-loop campaign): the Crucible bench runs the real runtime | fable-master/lane-bench | MUTATING 2026-09-03 | `scripts/lib/bench/crucibleBench.mjs`, `scripts/lib/bench/funMetrics.mjs`, `scripts/measure-fun-loop.mjs` (crucible glue only), `test/fun-bench.test.mjs`, `test/fun-measurer.test.mjs`, `test/crucible-bench-real-path.test.mjs`, `tools/agentic/scenarios/crucible-*.json` | real-runtime Crucible runs with a seeded pilot policy → fun metrics from real bus events → same-seed hash identical → commit |
| PQ-173.00 repair/.02/.03 INSTRUMENT lane (fun-loop campaign) | fable-master/lane-instrument | MUTATING 2026-09-03 | `scripts/lib/bench/frameStripCapture.mjs`, `scripts/run-fun-bench.mjs` (headed path), `scripts/critic-fun-loop.mjs`, `scripts/lib/critic/`, `scripts/report-fun-loop.mjs`, `scripts/lib/report/`, `tools/agentic/critic/`, `design/program/TRANSLATOR_CHECKLIST.md` | real gameplay frames at the chase camera → vision critic → owner report on one real cycle → commit per leaf |
These paths are protected from overwrite until a task explicitly adopts and finishes them. They are
not active leases and do not prevent other tasks from proceeding.

| Work | Exact paths | Plain next action |
|---|---|---|
| Paused Ceres acceptance repair | `scripts/lib/ceresFiveMinuteAcceptance.mjs`, `test/ceres-five-minute-acceptance.test.mjs` | Preserve without further acceptance work; it does not count as an INFERENCE unit |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
