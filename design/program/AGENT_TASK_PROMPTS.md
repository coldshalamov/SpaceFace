<!-- LIFETIME: VOLATILE -->
# Copy-ready prompts for SpaceFace agents

```yaml
refreshed: 2026-08-09
baseCommit: 8b7b1d3b26181fdc38325a63f5e9d85574bf321b
expiresAfterCommits: 10
expiresAfterDays: 2
```

These prompts are intentionally plain. The agent obtains technical detail from the canonical map,
live board, queue row, packet, code owners, and tests. Give one prompt to one thread. A thread finishes
one task and stops; it does not start an open-ended campaign.

## Starting several threads at once

Give Prompt A to each thread, or give different concrete prompts from the bottom of this file. Each
thread reads the same `NOW.md` and `--ready` list. If two threads initially inspect the same task, the
first one that actually begins mutation records the short exact-path row; the other chooses the next
task and keeps working. No coordinator, permanent lane, or worktree is required.

## Prompt A — find and finish the next task

```text
Finish one SpaceFace task end to end.

Start at CANONICAL_BUILD_MAP.md and design/program/NOW.md. Run
`node scripts/program-dispatch.mjs --next` and take that first task, then open its exact queue row
and active packet. Use `--ready` only to select the next result when the first task has an exact
currently dirty overlapping hunk that another thread has not handed off. Do not create a
worktree. Add one short NOW.md row only when you begin editing; research, reading, tests, and reviews
do not reserve files.

Implement the selected outcome, run its focused proof, obtain the required review, stage only its
exact files, commit, fetch, push the current branch explicitly, update its receipt/status truthfully,
and remove the NOW row. If another thread has an exact dirty hunk, preserve that hunk and continue on
disjoint work or take the next returned task; do not declare the packet or repo blocked. Do not loop
on an unchanged failing command.

Stop after one finished task. Your final response must be exactly understandable as:
RESULT: DONE or NOT DONE
PLAYER RESULT: one plain sentence
COMMIT: hash, or none
PROOF: checks/evidence actually completed
REMAINING: none, or the exact missing outcome
NEXT ACTION: one executable next task
DIRTY PATHS: every uncommitted path, or none
```

## Prompt B — finish one exact queue unit

Replace `<UNIT_ID>` once before sending.

```text
Finish exactly `<UNIT_ID>` in SpaceFace and do not start another unit.

Read CANONICAL_BUILD_MAP.md and design/program/NOW.md, then run
`node scripts/program-dispatch.mjs --ready` and locate `<UNIT_ID>` in
`design/program/roadmap/program-queue.json`. Run `node scripts/program-dispatch.mjs --id PQ-XXX`
using the unit's `parentId`, then open that packet, verify the live owner code, and deliver the exact
unit's player outcome. If the unit is not yet printed by `--ready`, its `dependsOn` list is integration
order, not permission to forget the task: complete any missing in-repo prerequisite needed to deliver
the assigned outcome, and do not mark the unit done until the full result is integrated. Do not create
a worktree and do not stop because another task exists. Record a
NOW row only during mutation. Preserve any exact foreign dirty hunk; continue the disjoint parts and
arrange an explicit handoff for a genuinely overlapping hunk.

Keep working until the outcome is implemented, focused proof is green, required route/review evidence
is honest, and the exact files are committed and pushed. Update the receipt and task state. End with
the DONE/NOT DONE template from design/program/02_REMAINING_WORK.md, then stop.
```

## Prompt C — finish or discard an existing dirty candidate

```text
Take responsibility for the unfinished candidate named below. Do not create a new parallel copy.

Read CANONICAL_BUILD_MAP.md, design/program/NOW.md,
design/program/DEVELOPMENT_HANDOFF_2026-08-09.md, and the candidate's current diff/evidence. Add a NOW
row when mutation begins. Determine the exact player outcome it was meant to deliver, then either:
(1) revise it through the real production owner until it passes its required review and publish it,
or (2) explicitly discard the candidate while preserving the useful findings and restoring a clean,
accounted state. A pile of files, passing source tests, or 'handoff ready' is not DONE.

Commit and push the finished result or the explicit discard/accounting result. End with the
DONE/NOT DONE template from design/program/02_REMAINING_WORK.md and list every remaining dirty path.
Stop after this candidate is accounted for.
```

## Current concrete prompts

### 1. Revised refinery route proof

```text
Use Prompt B with UNIT_ID `PQ-022.refinery-reauthor-h1`. Finish the real Browser/Electron refinery
presentation proof and publish its exact causal result. Stop after this unit.
```

### 2. Wreck Cathedral re-authoring

```text
Use Prompt B with UNIT_ID `PQ-018.cathedral-reauthor`. Deliver the revised dominant hull/rupture
story as an exact-source whole asset that earns KEEP or returns an explicit REVISE. Stop after this
unit; do not run its later H1 automatically.
```

### 3. Receiver facilities already present in the checkout

```text
Use Prompt C for `PQ-019.receiver-facility-reauthor`. The current Phase A candidate is G1/G2/G4
REVISE. Revise the lawful catcher and covert fence until exact-source review says KEEP, or discard the
candidate explicitly. Do not promote the current REVISE bytes. Stop after Phase A is accounted for;
Phase B promotion and Phase C runtime release are separate tasks.
```

### 4. Dense PresentationWorld native acceptance

```text
Use Prompt B with UNIT_ID `PQ-038.native-acceptance`. Run one clean supported-runtime candidate,
publish the honest native evidence, and stop. Do not turn a failed acceptance run into an unrelated
implementation campaign.
```

### 5. Exact packaged Electron acceptance

```text
Use Prompt B with UNIT_ID `PQ-041.native-acceptance`. Build and run one exact package plus its paired
Browser route, publish the ledgers, and stop.
```

### 6. Dirty-range GPU acceptance

```text
Use Prompt B with UNIT_ID `PQ-040.native-acceptance`. Run one clean paired Browser/Electron
dirty-range candidate, publish the result, and stop.
```

### 7. Ceres disabled tender client

```text
Use Prompt B with UNIT_ID `PQ-045.tender-client-materialization`. Put one real disabled client in
Ceres, preserve the tender's target through Continue, move through the existing job owner, update the
five-minute census, prove it, publish it, and stop. The speculative late target-motion audit is not a
prerequisite.
```

### 8. Two late target-motion questions

```text
Use Prompt B with UNIT_ID `PQ-045.target-motion-late-audit`. Run only the two named reproductions.
Repair a defect only if it reproduces; otherwise publish a short dismissal receipt. Do not reopen the
feature, rerun the whole campaign, or delay tender-client work. Stop after the two answers.
```

### 9. Continue the Ceres lived-world chain

```text
Use Prompt B with the first unfinished unit in this exact sequence:
`PQ-045.route-topology` -> `PQ-045.causal-chain` and `PQ-045.npc-identity` ->
`PQ-045.prop-promotion` and `PQ-045.wreck-dressing` -> `PQ-045.vfx-recipes` ->
`PQ-045.five-minute-h1`.

Finish only the one selected unit and stop. Do not interpret the later units as blocked; they are the
documented continuation for subsequent agents.
```

The final `PQ-045.human-review` is a prompt for the named human reviewer, not an autonomous agent.
