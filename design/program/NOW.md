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
| Sole-agent cleanup + demo-polish sweep: tree drained, worktrees removed, PRs resolved; now bug sweep + small build-map demo rows + baseline | devin-sweep-oct3 | IN PROGRESS | `design/program/DEMO_READINESS_2026-09-20.md` §6 as rows fix, `build_map.md` open rows, whatever focused tests each fix needs | small fixes landed by pathspec; bigger defects to the ledger |
| 20-unit packet sitting — 10 NXI inference rows (003,004,055,056,103,104,119,120,135,136) + 7 ear fable packets (FB-078/079/081/082/083/122/135) + PB-SLICE-Z + D143 adjudication + vm-drop import batch | devin-packets-oct3 | RELEASED | all landed + reviewed: NXI pins/impls `dcfbba307`…`f3dd82e49`, ear batch row 256 DONE (`1b09d8704` elem tow-mass), SLICE-Z `bc8e462d1`, vm-drop 5-import stack, D143 closed `5ac496fbb`+`c78e2ebb0`+`616ffec26` (all three heads sighted ≤12.5 s, ledger row removed) | — |
| Mission seam closeout — rows 85/86 DONE; PR #215/#216/#218/#219 merged, #192 closed; tree drained to zero uncommitted work | devin-sweep-oct2 | RELEASED | all landed | — |
| Board row 218 (NXB-051 hull marks) plus free-seam leaves: stunt flail D144, depot redirect haul pair, salvage-bay tip, and 24 infer-* voice leaf units | grok-oct3 | RELEASED | all landed: `20ec8233b`, `30b842ee3`, `408c2ce07` (237/237 leaf tests green) | — |
| Bullet-time empty meter, boost cut-out, and travel-burn spent line | grok-oct3 | IN PROGRESS | `src/systems/bulletTime.js`, `test/infer-bullet-time-empty.test.mjs`, `src/systems/flightV3.js`, `test/infer-boost-spent-toast.test.mjs`, `test/infer-travel-burn-spent.test.mjs` | review travel-burn line |
| INFERENCE 10 — celebration+identity audio, landmark payoffs, rep-exclusive hardware, answerable maydays, sector trade signatures, chronicler big beats, presence, surrender verb, ending archive, kill replay | glm-infer-10b-oct3 | RELEASED | all landed (survivor pods `c277e8357`, ending archive `f1e895529`, replay tape `b3cdd5f76`, landmark payoffs `90bb99af1`, chronicler `9d67ee246`, barkeep faces `420223a34`) | — |
| Cross-area documented polish/research pass — review sweep + small fixes + ledger rows | polish-pass-oct3 | RELEASED | `POLISH_PASS_2026-10-03.md` + look/bloom retune landed `a57a9cbed` | — |
| 20-unit campaign — 5 seam queues run by subagent workers: massline/receiver (NXB-005/006/008/023, NXI-024/032/092), mining/drill (NXB-021/022, NXI-083/084), story/instruments (NXI-179/180/215/236), vfx/render (NXI-195/203/204, NXB-060), swarm B1/B2 | glm-campaign-oct3 | IN PROGRESS | workers mutate only their seam's src/test files (pathspec commits per unit); orchestrator alone edits `build_map.md` §1C rows and this board at wave close | worker results → orchestrator verification pass → board row updates |

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
