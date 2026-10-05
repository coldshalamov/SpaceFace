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
| BATCH-20 sitting — 20 units down the ladder: defect ledger → board 278-283 → lanes → authored | devin-batch20 | IN PROGRESS | landed: D136 (with owner session), row 196 J4/J5, §22 A7, §22.4 B10 (retraction + DONE), M0-EVIDENCE. In flight by my subagents: convoy spill `src/systems/encounter*.js`+`src/data/encounters/329-curtain-convoy.js`; motion lab `test/motion-lab-scenarios.test.mjs`+kinematics; D130 leg (site TBD, fixture-counted); P08 `src/ui/station/screens/shipworks.js`. `build_map.md`/ledger §6/receipts by the orchestrator only | land unit → review subagent → close row → next |
| BATCH-20 sibling sitting (second dispatcher) — same ladder, disjoint units: rows 279+281+285+286+287 + SF-SEDNA-FILING (ea8c66797+dfd2b3d11) + vesta-yard (91ae1c982) + geology-pin (738ec431d) + preload (fdf3a0547) + SF-DEST-TRUTH (3009a84f5+f26833281) + SF-MIX-MIRROR (1e337c37b+917a4332e); SF-CONTRACT-DEST-TRUTH (612c7a440+a140ba9da) + SF-WRECK-FILING (6f0f9fdbf+0fbdfd7cd) + SF-DEN-ADMIT (e8b78b767+ca81898d4) + SF-OFFER-BERTH-TRUTH (0d8783a32+274f60b23) + SF-GHOST-DESK (64356fca8) + SF-POI-DESK (4a82720e0); + SF-ECOLOGY-DESK (75726c67b) + POI re-offer (42b10167c) + SF-REFUSAL-VOICE (e285ed1cf) + SF-YARD-DOCK (437e357e9) + SF-SURVIVOR-DEST (782df7734) + SF-LOCK-RECYCLE (e4d702223 + optic-demote fix 7c360f3ab) + admission-lane review fixes (056bccdf6: shared CONTRACT_DESK_SERVICES, record passthrough, rep parity, stale-dest re-resolve, faction fallback) + ledger rows D132/D133/D134 — 20 units landed, every adversarial review LAND or LAND-WITH-NITS resolved | devin-batch20-b | DONE 2026-10-05 | — | batch complete: U1–U20 on master, all review nits applied, foreign work preserved |
| Sole-agent cleanup + quiet-host sweep: master-side stale checks repinned and pushed (`e15597892`); soak market-verify hardened (`127197043`); D67 closed (`b231a7f0c`); D24 resoak attempts F+G died at launch — the cook lane starves when two headed system-Chrome probes contend for the GPU (product is bounded/fail-visible, worst ~210 s; contention, not a regression — a lone probe clears in ~46 s); attempt H launched 08:01Z on a quiet host, in flight cycling | devin-sweep-oct3 | IN PROGRESS | `scripts/lib/releaseSoakProbe.mjs`, `scripts/check-gameplay-core.mjs`, `design/program/DEMO_READINESS_2026-09-20.md` §6 | D24 soak verdict → heapsnapshot diff → remove or keep row; then final sync (PRs/tree/master==origin) |



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
