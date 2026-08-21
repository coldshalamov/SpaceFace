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

## Which door? Exact task vs. develop the game

- **Finish a known exact task** → use Prompts A/B/C below, or
  `node scripts/program-dispatch.mjs --next/--ready/--id`. The queue is unchanged.
- **Spend inference making the game richer** — NPCs, enemies, sectors, economy, story, graphics, VFX,
  audio, gameplay feel, content, a playable slice → start at
  [`INFERENCE_LANES.md`](./INFERENCE_LANES.md). It indexes the reusable `WF-01`–`WF-19` workflows with
  the `1x`/`3x`/`5x` scale shorthand and a copy-ready activation prompt. Concrete implementation work
  the lane produces still goes through the normal ownership/packet/acceptance system.

## Starting several threads at once

Give Prompt A to each thread, or give different concrete prompts from the bottom of this file. Each
thread reads the same `NOW.md` and `--ready` list. If two threads initially inspect the same task, the
first one that actually begins mutation records the short exact-path row; the other chooses the next
task and keeps working. No coordinator, permanent lane, or worktree is required.

## Prompt A0-H — orphan harvest / unused models / leftover agent copies

Copy `ORPHAN_HARVEST_GOAL.txt` as the whole prompt. Do not paraphrase. The
playbook and ledger it names are mandatory.

```text
This is a campaign: harvest leftover agent work and unused models into the live game. Do not use INFERENCE. Do not stop after one unit.

Law: design/program/ORPHAN_HARVEST_PLAYBOOK.md. Follow it for classify, review, merge, finish, wire, plan updates, and cleanup. The running board is design/program/ORPHAN_HARVEST_LEDGER.md.

Mission:
1. Mine C:\sf-agents and leftover branches. Mark each copy done, near-done, partial, superseded, or junk. Merge only done work, or near-done work after you finish its one missing seam. Checkpoint everything else so it cannot rot. Port onto current master owners. Do not merge a branch wholesale.
2. Review unused models in the main project. First model unit: rebuild the compressed Hitch the player actually flies from the later polish that was left off the release copy. Never paste uncompressed source over that release. Then other unused ships, traffic, markings, and Ceres props. Polish if they are still wonky. Wire only what beats live and is not broken. A clay tube with boxes does not ship.
3. After every unit, update the ledger and the owning plan or queue row.

One unit at a time in the main checkout. Do not create worktrees. Classify, finish a near-done seam if there is one, run ONE subagent review panel and ONE focused proof, then MERGE, CHECKPOINT, DROP, or ADAPT. Never merge half-done or failing work. Never re-review the same hash. Never rerun the same failing check unchanged. If the first repair pass is not merge-safe, checkpoint and take the next unit.

Commit and push each merged unit on the current branch by name. Do not delete a copy until its ledger row exists and every port from it is pushed.

Keep going until every known copy and unused model has a ledger row, every MERGE is on the main line, every near-done item is finished or honestly checkpointed with a next action, and DROP copies are safe to delete.

RESULT: DONE only when no finished work remains only on an orphan copy and the ledger is complete.
```

## Prompt A0-W — Asteroid Works / mining minigame unreadable

Copy `ASTEROID_WORKS_PLAYFIELD_GOAL.txt` as the whole prompt. Do not paraphrase.
The campaign file it names is mandatory.

```text
This is a campaign: put the player inside the asteroid. The mine is the screen. Do not use INFERENCE. Do not take hitch/PQ-129 or PQ-050. Do not stop after one unit.

Law: design/program/ASTEROID_WORKS_PLAYFIELD.md (read §0 spirit and §3 vanilla collapse first) and design/frontend/SCREENS_E_ASTEROID_WORKS.md. Grammar: design/frontend/INSTRUMENT_GRAMMAR.md. Dispatch: node scripts/program-dispatch.mjs --id PQ-130. Take the first claimable leaf. --next still returns fleet remaster.

Spirit: a stranger glances and sees rock, a hole, a vehicle, ore as ore, gas as danger — not a sci-fi website with a Minecraft inset. Remaining chrome is a rig dashboard that earns every pixel. Empty Power/Export/Couriers bays, the novel context well, the 264px reprint tape, the cyan video-embed frame, and 8px keypad labels are the ugly HUD. Shrinking that chrome is not the work.

Vanilla collapse is a fail: shorter CSS bays, zoom-only camera, tan×0.7, crystal scale 1.5, slower MOVE_COOLDOWN, truncated inspector strings, more amber stripes. If that is the PR, you have not started.

Owner playtest 2026-08-20 is the defect list. HUD is ugly AND too big. Do not paraphrase into new mechanics.

Order:
1. PQ-130.01 Theater — the mine is the screen; dashboard not a website; local camera; flat grid.
2. PQ-130.02 Surgical drive — a heavy rig you place one cell at a time.
3. PQ-130.03 This asteroid’s rock — the body you tethered to, not dungeon sandstone.
4. PQ-130.04 Cells speak — a prospector can read the face.
5. PQ-130.05 The vehicle — “that is my drill.”
6. PQ-130.06 Hover as instrument — a picture that confirms; the board already taught.

Stay off hitch renderer files, Hitch/Kestrel, Waves 1–4. No camera-facing soft squares. No quality cuts.

Each leaf: play tether → Asteroid Works at a normal window. Whole-theater stills, not cube crops. check:playable after implementation. Commit only that leaf, then the next.

RESULT: DONE when a stranger sees the rock first, can tell cells apart without the context bay, finds the rover, moves it one cell on purpose, and the leftover chrome looks like a dashboard they would touch.
```

## Prompt A0 — overnight / “the work in the build map” / non-INFERENCE

```text
This is a campaign, not one task. Start at CANONICAL_BUILD_MAP.md. Do not use
INFERENCE_CONVERGENCE_METHOD.md or INFERENCE_LANES.md unless the user said INFERENCE.

Default unfinished campaign is PQ-050. Run
`node scripts/program-dispatch.mjs --id PQ-050`, take the first claimable ship, follow
ADVANCED_MODEL_TECHNIQUE_CONTRACT.md and MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md.
Each ship: at least five full-job cycles; three valid full-model stills per cycle;
three subagent reviews that list every obvious defect; implement all revises; then
do the whole ship again. Zoomed gray plates do not count. Clean up old stills before
commit. Wire only that ship, then the next. Do not stop after one ship. Do not touch Hitch.
```

## Prompt A0-P — hitching / “make the game play smoothly”

```text
This is a campaign, not one task. The game is hitching. Start at
CANONICAL_BUILD_MAP.md §8.4 and design/program/PERF_HITCH_CAMPAIGN.md.
Do not use INFERENCE. Do not take PQ-050. Do not lower default quality.

Run node scripts/program-dispatch.mjs --id PQ-129 and take the first
claimable leaf. Wave A names every >32 ms frame. Wave B removes the
named compose/compile/upload/admission brick. Wave C crowded 60 fps
waits until hitch count is halved.

One leaf at a time. Headed Electron or headed Chrome on the real GPU.
flight-compose-gate.test.mjs is not smoothness proof. Run check:playable
after every implementation leaf. If the classifier names a different
owner than the claimed leaf, write a reject receipt and take the named
owner. Keep going until the campaign stop condition is met.
```

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
