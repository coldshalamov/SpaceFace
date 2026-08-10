<!-- LIFETIME: VOLATILE -->
# NOW — threads changing the shared checkout

```yaml
refreshed: 2026-08-10
baseCommit: f773e086b2d702b98555e2c13c111ebd64a0028d
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

## Uncommitted work without a confirmed live thread

These paths are protected from overwrite until a task explicitly adopts and finishes them. They are
not active leases and do not prevent other tasks from proceeding.

| Work | Exact paths | Plain next action |
|---|---|---|
| PQ-019 receiver Phase A candidate (`REVISE`) | `assets/ships/m5_claim_outposts/**`; `test/pq019-receiver-facility-material-truth-pipeline.test.mjs`; `tools/art/promote_claim_outpost_receiver_facility_material_truth_v1.mjs`; `tools/blender/{build,render}_claim_outpost_receiver_facility_material_truth_v1.py`; `--class/` | Assign the receiver prompt, revise to exact-source KEEP or discard, then publish a `DONE`/`NOT DONE` handoff. |

## Start another task

Use the copy-ready prompts in [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md), or run:

```text
node scripts/program-dispatch.mjs --next
node scripts/program-dispatch.mjs --ready
```

Choose the highest-priority result you want, add its short mutation row only when editing begins, and
finish it. If one exact hunk is protected, continue the task's disjoint work or choose the next queue
row; never report the whole program blocked.
