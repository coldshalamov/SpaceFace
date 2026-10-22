<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-10-04
baseCommit: 76f4fe2527e2991510ebf704625bbf5cb439e1c7
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
7. Do not create a worktree by default; if one is unavoidable it is a single `.worktrees/<name>`
   shared by the whole sitting — port the work back and `git worktree remove --force` in the same
   turn. Existing worktrees are recovery obligations recorded in
   [`04_WORKTREE_AND_INTEGRATION.md`](./04_WORKTREE_AND_INTEGRATION.md), not current ownership.
   `git worktree list` shows only the main checkout before you walk away.

## Active mutation windows

| Task | Thread | State | Exact paths being changed now | Next terminal action |
|---|---|---|---|---|
| Build-map 30-row batch | devin-thirty-oct22 | active; checkpoint `.codex/agent-checkpoints/THIRTY-OCT22.json`; fight-read 490/491/492 landed 579d9e31, rock-core 486/487/509/510/511 landed 1edfe57, glass 474/494 landed b8eaa2e (10/30) | Remaining: faction-law-trade (513/515/516/525/526/530/531), faction-strange (517/518/519/524/527/528/529/532), pulse-print (433/435/437), pulse-world (439/441) — delegated to subagents 051ac9d6/0d458afd/7f6e8515, integrating on return | land 30 open rows, commit+push each with LANDED_REVIEW rows |
| Build-map 30-row implementation | codex-bm30 | active; checkpoint `.codex/agent-checkpoints/BM30-OCT22.json` | Controller: `src/systems/terrainAnchors.js` (only bounded spawn-slot argument fix for live row509 ReferenceError; leave with row509 owner), `scripts/player-truth/run.mjs` (capture swallowed frame errors), `scripts/lib/cleanFlightPlane.mjs`, `scripts/check-clean-flight-plane.mjs`, `test/clean-flight-plane.test.mjs`, `build_map.md`, `design/program/LANDED_REVIEW.md`, `scripts/lib/planFrontDoor.mjs`, `scripts/lib/planEngine.mjs`, `scripts/check-plan-integrity.mjs`, `test/plan-engine.test.mjs`; world: `src/story/endings/worldAfter.js`, `src/systems/postEndingReplay.js`, `src/systems/sectorSim.js`, `src/systems/traffic.js`, `src/systems/story.js`, `src/economy/stationConditions.js`, `test/al-world-1-ending-map-4242.test.mjs`; audio: `src/audio/audioSystem.js`, `src/audio/stuntScore.js`, `test/cv-ear-stunt-chain.test.mjs`; replay: `src/systems/killReplay.js`, `src/sim/killcamTape.js`, `src/sim/forceTape.js`, `src/render/killcamStage.js`, `src/ui/screens/gameOver.js`, `src/render/uiStage.js`, `test/al-show-1-rope-tape-4242.test.mjs` | Finish full rows 396, 404, 406, 455; continue free existing rows to 30; focused and affected-route verification, exact-path publication |
<!-- devin-inf20 closed 2026-10-21 — 26 catalog units landed (RC-02..22 batch, AL-LG-01..03, PULSE-03/05/06/07) + 2 already-true; all pushed -->
| INFERENCE 20 catalog batch B | devin-inf20b | active | `src/systems/postEndingReplay.js`, `src/systems/sectorSim.js`, `src/systems/story.js`, `src/systems/traffic.js`, `src/audio/audioSystem.js`, `src/audio/scoreDirector.js`, `src/audio/themeMatrix.js`, `src/systems/stuntCombo.js`, `src/systems/killReplay.js`, `src/sim/killcamTape.js`, `src/ui/screens/gameOver.js`, `src/render/uiStage.js`, `src/render/titleAttractStage.js`, `src/render/killcamStage.js`, `src/sim/titleAttractTape.js`, `scripts/bake-title-attract.mjs`, `src/data/sectorVisualProfiles.js`, `src/systems/alienEcology.js`, `src/ui/toasts.js`, `src/ui/screens/pause.js`, `src/render/camera.js`, `src/ui/screens/statistics.js`, `src/systems/travelLanes.js`, `src/data/flavor/020-ad-board.js`, `src/data/flavor/030-graffiti.js`, `design/program/INFERENCE_IDEAS.md`, `design/program/NOW.md` | land catalog units AL-LG-06..09, AL-PR-01..10, RC-26/27/36/39/40/47, PULSE-01/02 → mark SHIPPED, push |
| INFERENCE 5 catalog batch C: PULSE-04 + AL-HF-01 landed (4bff4eeee, 954d40484); in flight AL-LG-13, AL-PR-16, AL-HF-04 | devin-inf5c | active | `src/data/automation.js`, `src/systems/automation.js`, `src/ui/screens/automationPanel.js`, `scripts/check-entity-links.mjs`, `test/automation-outpost-offline-chain.test.mjs`, `src/ui/screens/settings.js`, `src/core/gameState.js`, `src/save/saveSystem.js`, `src/core/timeEffects.js`, `src/systems/bulletTime.js`, `src/combat/stuntRunRules.js`, `src/systems/survivalResults.js`, `src/ui/bindings.js`, `src/ui/input.js`, `src/ui/screens/help.js`, `src/ui/racingHud.js`, `src/core/mainToSimEventSurface.js`, `src/systems/missions.js` (two additive race-restart hunks only), new `test/al-lg-13-*`, `test/al-pr-16-*`, `test/al-hf-04-*`; catalog status cells in `design/program/INFERENCE_IDEAS.md` for AL-HF-01/02/06/11/13/14/15, AL-LG-13/14/15, AL-PR-16, AL-HF-04, PULSE-04 | land units, mark SHIPPED, push |
<!-- devin-parallel-c1 closed 2026-10-19 — adopted stale: every claimed path is clean at HEAD (no orphan hunks); all its landed units are already on master. -->
<!-- antigravity-graphics landed 2026-10-19 in f12a40d72 — adopted stale by devin-lighting: its claimed diff (bloom soft-knee, surface grade, star halos, stencil/material pass) committed intact, plus white field-extent glow, ship headlamps, field de-blanket, and lamp-gain lift on the same unit. -->
<!-- devin-agentic-oct18 closed 2026-10-20 by devin-fleet-oct20 — its run ended on wave-10 (three clean consensus waves, 27f93dd52); the untracked audit logs/packets under agentic-run-oct18/ are its leftovers, left untouched. -->
| Fleet run — 40 build-map rows (§N); adopted stale 2026-10-21 ~07:10Z by the same lane after 185 min idle. Owner protocol update: every plan and finished packet gated by 3 successive subagent approvals; Codex gpt-6.1-sol xhigh audits the packets every 3 tasks; controller-only commits | devin-fleet-oct20 | IN PROGRESS | Shared surfaces under controller lock: `build_map.md` (seam claims + landed-row deletions), `design/program/NOW.md`, `design/program/LANDED_REVIEW.md`, `design/program/agentic-run-oct20/`; per-row write sets in `agentic-run-oct20/out/R<row>/files.txt` | 8 landed+pushed (roe pair, R393, R453, R403, R481, R429, R390 124c2b3ef, R467 c37a4854b); audits #1+#2 xhigh done, fixes pushed (6bc24f069). Audit #3 due after next landing. Packet-gated near-landing: R431/R461/R401/R424 (confirms in flight); implementing: R270-rem/R473/R479; plan-gated or planning: R462/R423/R394/R395/R399/R432/R469/R475/R400/R409/R448/R459/R463/R472; deferred on seam: R444/R452/R460 |
<!-- devin-ten-oct18 closed 2026-10-18 — INFERENCE x5 + build-map x5 sitting complete: ten units
     landed (5 inference + 5 §23.2 build-map); per-unit commits in git log; checkpoint released. -->



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
