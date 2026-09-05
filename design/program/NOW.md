<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-09-05
baseCommit: 44f019aa449e9b5b44256ec50bd86fccd443c4e1
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
| PQ-143.00 sector identity table, made true on the route (Helios, Ceres) | fable-orchestrator + opus implementer | MUTATING | design/SECTOR_IDENTITY.md (new), src/data/sectorVisualProfiles.js / sectors.js / sectorZones data hunks the unit names, src/systems/sectorSim.js, test/sector-identity*.test.mjs, scripts/lib/bench/scenarios/world.sector_identity*.mjs, design/program/roadmap/receipts/PQ-143-00-REPORT.md | review, commit by pathspec, push master |
| PQ-180.03 reference frames for every surface | fable-orchestrator + opus implementer | MUTATING | scripts/capture-ui-matrix.mjs, scripts/check-visual-regression.mjs, scripts/lib/ui-matrix*/, test/visual-regression*, design/frontend/ (matrix docs), the committed reference-frame baseline dir the check names | review, commit by pathspec, push master |
| PQ-137.11 knock budget B13 (final cycle) | fable-orchestrator + opus implementer | MUTATING | src/core/sg02DynamicBodyOwner.js, src/core/physics.js, scripts/lib/bench/crucibleBench.mjs, scripts/lib/bench/frameStripCapture.mjs, scripts/lib/bench/feelBars.mjs, scripts/lib/bench/scenarios/feel.knock_budget*.mjs, scripts/measure-fun-loop.mjs, test/sg02-player-contact-give.test.mjs, test/knock-budget.test.mjs, test/fun-measurer.test.mjs, test/frame-strip.test.mjs, design/FEEL_CONTRACT.md (B13 row), design/program/roadmap/receipts/PQ-137.11-REPORT.md | review, commit by pathspec, push master |
| Frontend repair pass: every menu + HUD (visual bugs, hierarchy, banned patterns) | claude-fable interactive (owner-directed) | MUTATING | styles/menu.css, styles/ui.css, styles/station.css, styles/station-workbench.css, styles/station-berth.css, src/ui/screens/techTree.js, src/ui/screens/automationPanel.js, src/ui/screens/{help,saveLoad,gameOver,missionLog,crucible,crucibleDraft,footprint,range,newGame}.js, src/ui/station/screens/{contracts,industry,ledger,bar}.js, src/ui/station/stationApp.js, src/ui/uiRoot.js, src/ui/uiPrimitives.js, src/ui/galaxyMap.js, src/ui/ship/shipScreen.js, src/ui/{hud,masslineHud,massSeedHud,planetHud,fieldHud}.js | walk every screen in the browser, focused checks, commit by pathspec per bucket, push master |

_Previously:_ no active mutation windows. The 2026-09-04 orchestrate-next-build handoff is finished: everything
that was in flight is committed and pushed, and no agent is holding a source file. See
[`HANDOFF_2026-09-04_orchestrate-next-build.md`](./HANDOFF_2026-09-04_orchestrate-next-build.md) for
what landed, the two 47-A goldens that moved, and the two open PQ-180 harness defects.

The three prior rows (PQ-180 frontend grammar, an unnamed "Work" row, Paused Ceres acceptance repair)
were all confirmed STALE by `node scripts/check-now-liveness.mjs` on 2026-09-04 and adopted by this
agent under rule 3a. The Ceres pause still holds as a note, not a row:
`scripts/lib/ceresFiveMinuteAcceptance.mjs` and `test/ceres-five-minute-acceptance.test.mjs` are
preserved without further acceptance work.

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
