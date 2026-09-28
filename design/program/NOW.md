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
| Graphics program: finish every GRAPHICS_PROGRAM.md backlog row (GFX-1, 3–14) | devin-graphics | LIVE (verified 2026-09-27) | `tools/blender/forge/**`, `tools/art/render_hull_posters.mjs`, `scripts/fleet-look.mjs`, `scripts/flight-look.mjs`, `scripts/build-pack-release-assets.mjs`, `src/ui/hullPosters.js` (GFX-5), generated asset outputs via `publish.mjs` (`assets/ships/**`, `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`), `design/program/GRAPHICS_PROGRAM.md` | packet 1: env portability + GFX-6 kit helpers + GFX-13 wreck pack + GFX-1 trade hub; then GFX-3 place batches, GFX-4/7/8/14 bodies, GFX-9/10/11/12 runtime |
| Perf pipeline: plan + leaf implementation | devin-perf-pipeline | STALE — adoptable (writer dead ~3h; liveness 2026-09-27) | `src/render/**` + flight/input/perf files per this row's original claim — uncommitted hunks in tree are stranded work, adopt per §3a | probe-route dependent: landed deep-queue pipeline-gate overlap + union projectile sweep + alloc-scratch/memo/latch batch + probe GC boundary + COOP/COEP + getAppMetrics witness; agent stopped mid-lane |
| THE HAND lane session — flight/rope/fields/verbs/stunts/onboarding judgment + found-defect fixes | devin-lane-hand | STALE — adoptable (~2h) | `src/systems/masslineThrow.js`, `src/systems/tetherGameplay.js`, `src/systems/fields.js`, `src/systems/stuntGrammar.js`, `src/systems/onboarding.js` | per §3: judged implemented units live, work found gaps; flightV3.js/input.js under perf-lane claim — coordinating by exact path. Open ledger rows in this area at the time the writer went quiet: D87 (fields runtime-profile guard), D88 (tether:cutDenied no subscriber) |
| Object-interaction makeover: repair packet-A overkill wire (missing `_onCombatDamage` handler + mining consumer), review + land fracture/substance/verb packets | fight-interactions | repairing + landing | `src/systems/collisionConsequences.js`, `src/systems/mining.js` | add handler, wire overkill fracture path, focused test, baseline, pathspec commits |
| Board §1C wave-1 dispatch — rows 1–13 + 20–21 claimed to `devin-wave1` agents; orchestrator edits board/NOW only | devin-swarm | dispatching | `build_map.md` §1C, `design/program/NOW.md` | flip CLAIMED rows on claim, delete on landing; wave 2 = rows 19 + 22–25 after render files settle |
| VM-LATCH-B (board §1C row 23): import combat-/weapon-/bombs-/quarks-/bounty-hunt-/midflight-/well-distortion-/wreck-wisps- vm-drop packages | devin-w2-vm-latchb | LIVE | per-folder patch targets under `src/` (mostly `src/render/vfx.js` + combat/weapon latch files), `design/program/vm-drop/IMPORT_DIGEST/report.md`, `build_map.md` §1C | apply patches → focused check → pathspec commit per folder → digest update |
| Board §1C row 24 VM-LATCH-C — import field-force/fields/energy/flight/gas/momentum-sink/far/asteroid-field/flyby/optic-lattice/plume vm-drop latch packages | devin-w2-vm-latchc | importing | `src/systems/fields.js`, `src/render/forceLanguage/fieldForcePresentation.js`, `src/world/farActorTable.js`, `src/world/asteroidField.js`, `src/systems/world.js`, `src/systems/flybyFocus*.js`, `src/render/thruster/systems/familyFleet.js`, `src/render/thruster/systems/continuousPlume.js`, `src/render/weapons/energyBoltPool.js`, `src/render/vfx.js` (energy/gas latch hunks only), `test/*` new latch tests, `design/program/vm-drop/IMPORT_DIGEST/report.md` | apply patches per folder, run named check, pathspec-commit each, update digest |
| Board §1C row 10 D80 — hauler income adjudication: band stays a career-income gate; the strategy moves to contract-stacking freight (live bulk_trade/cargo_delivery serves) with spot arbitrage as filler; cohort hauler lo recalibrated 112.5→100 (Foothold net floor, owner 2026-09-19 ruling — the pre-derived bar D64 retired for courier) | devin-w1-d80 | LIVE | `src/balance/careerCohorts.js` (runHauler + CAREER_BANDS.hauler), `scripts/check-career-earnings-benchmark.mjs` (hauler contract serves), `test/fixtures/m3-career-cohorts/cohort-report.v2.json` (gate-regenerated), `design/program/DEMO_READINESS_2026-09-20.md` §6, `build_map.md` §1C row 10, `design/program/NOW.md` | implement contract-serve dispatch in both hauler models → focused hauler runs on all 3 seeds → re-run both gates → pathspec commit; delete D80 + board row 10 on landing |
| Board §1C row 25 VM-LATCH-D — import quiet-latch vm-drop packages (docking-*/customs-*/opening-plan-*/undock-host-*/catch-nets-*/npc-job-signatures/loot-magnet/law-heat/bark-director) | devin-w2-vm-latchd | LIVE | `src/render/vfx.js`, `src/render/openingSubmissionPlan.js`, `src/render/renderer.js`, `src/systems/dockingCorridor.js`, `src/systems/lawSecurity.js`, `src/systems/lootShards.js`, `src/systems/npcJobsRuntime.js`, `src/systems/barkDirector.js`, new `test/*-quiet-*.test.mjs`, `design/program/vm-drop/IMPORT_DIGEST/report.md`, `build_map.md` §1C row 25, `design/program/NOW.md` | per folder: apply patches → focused check → pathspec commit → digest ledger; then delete board row 25 + this row |


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
