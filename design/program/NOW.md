<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-06
baseCommit: 75a3885984cdb52b5ac678e24fa4e662c0b8ba06
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
| Station migration and retained controls | controller 01a0768b / terra idle_recovery | MUTATING | `src/ui/station/stationApp.js` (controller insurance, Terra handoff), `src/ui/station/screens/factions.js`, `scripts/check-first-dock-handoff.mjs`, `test/station-exit-confirmation.test.mjs` | finish dismissal; controller review and commit returned extraction/import changes |
| Contract readiness parity | claude-opus / controller 01a0768b | MUTATING | `src/ui/station/screens/contracts.js`, `scripts/check-mission-preflight.mjs`, `scripts/check-mission-board-recommendation.mjs` | restore shared preflight authority; parent review |
| UI measurement | luna provider_preflight | MUTATING | `scripts/capture-ui-matrix.mjs`, `scripts/lib/uiBudgets.mjs`, `test/ui-budgets.test.mjs` | fix callback error preservation and current public context route |
| Operational limits route | luna economy_fixtures | MUTATING | `scripts/probe-automation-outpost-live.mjs` | prepare real Drone Bay/finite ore/fuel/depot route for serial capture |
| Production baseline | controller 01a0768b | MUTATING | `scripts/probe-runtime-witness.mjs`, `scripts/lib/runtimeWitnessProductionMatrix.mjs`, `test/runtime-witness-production-matrix.test.mjs` | finish public routes after station migration |
| World materials and hit feedback | controller 01a0768b | MUTATING | `src/render/industrialMaterialFamilies.js`, `src/render/visualOverrides.js`, `src/render/engineTrailSurfaces.js`, `src/ui/asteroid/asteroidRenderer3d.js`, `test/industrial-material-families.test.mjs`, `design/program/roadmap/receipts/PQ-190-00-material-candidate.md`, `src/render/vfx.js`, `test/vfx-weakpoint-receipt.test.mjs` | visual review of authored admission and real combat feedback |
| Reauthored place acceptance | controller 01a0768b | MUTATING | `scripts/probe-pq022-corridor-asset-leaves.mjs`, `scripts/validation-manifests/pq022-corridor-asset-leaves.mjs`, `scripts/validation-manifests/pq022-refinery-reauthor-browser.mjs`, `scripts/validation-manifests/pq022-refinery-reauthor-electron.mjs`, `scripts/validation-manifests/pq022-billboard-buoy-reauthor-browser.mjs`, `scripts/validation-manifests/pq022-billboard-buoy-reauthor-electron.mjs`, `test/pq022-reauthor-h1-manifests.test.mjs` | resolve billboard readability; Browser/Electron route acceptance |
| Next ten plan refinement | controller 01a0768b | MUTATING | `design/program/NOW.md`, `design/program/roadmap/active/PQ-143.md`, `design/program/roadmap/active/PQ-144.md`, `design/program/roadmap/active/PQ-177.md`, `design/program/roadmap/active/PQ-184.md` | land senior refinements in existing queue |

Returned GLM/Terra extraction candidates are under controller review; their exact dirty paths remain
preserved in Git. Native workers have released those files. The ordinary-life, operational-limit,
market virtualization, HUD and chart source changes are committed; their remaining route acceptance
is work, not an active source reservation. PQ-187.00 is closed in the canonical queue.

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
