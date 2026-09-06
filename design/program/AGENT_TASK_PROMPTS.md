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

## Prompt 0 — the default (no scope words)

```text
Read CANONICAL_BUILD_MAP.md section 1 and do exactly what it says: node scripts/program-dispatch.mjs --next is your unit (fresh lookahead reservations are skipped); read its packet, especially "How agents get this wrong"; before mutation create a checkpoint for the current unit and reserve at most the next four units if this prompt is a sequence; finish the whole unit to its done-when in player units on a fixed seed; if it is feel or combat, run design/program/FUN_CONVERGENCE_LOOP.md; commit only your files by pathspec and push the current branch by name; report in the section 1.4 format in plain words; then close the checkpoint before taking the next unit. Stop only for a section 1.5 stop condition, and say which.
```

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
first one that actually begins mutation creates the task checkpoint and records the short exact-path
row; the other chooses the next task and keeps working. No coordinator, permanent lane, heartbeat, or
worktree is required.

## Checkpoint protocol — include this in every mutation prompt

Before the first patch, run:

```text
node scripts/agent-checkpoint.mjs start --task <UNIT_ID> --owner <THREAD_ID> --path <EXACT_PATH> \
  --todo "preflight" --todo "implement" --todo "verify" --todo "receipt" \
  --reserve <NEXT_UNIT_ID> --reserve <NEXT_NEXT_UNIT_ID>
```

Use 5–10 bounded todos when the unit is larger; each should fit inside 90 minutes. Put the printed
`.codex/agent-checkpoints/<UNIT_ID>.json` path in the NOW row. At each meaningful boundary run
`node scripts/agent-checkpoint.mjs check --file <CHECKPOINT> --todo <N>`; this timestamps a real
checkpoint and is not a heartbeat. Reserve no more than five tasks total, including the current task;
when the current task finishes, close its checkpoint and start the next one before mutating. `node
scripts/program-dispatch.mjs --next` skips fresh reservations, while `--ready` annotates them. If
`node scripts/check-now-liveness.mjs` says a row/reservation is stale, inspect the current diff, adopt
the existing checkpoint, and continue it. If another live agent has claimed a future reservation,
re-plan rather than contesting or forking the unfinished work.

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

## Prompt A0-G — 3D objects / same-bar remaster (safe beside hitch work)

Copy `GRAPHICS_3D_GOAL.txt` as the whole prompt. Do not paraphrase. The campaign
file it names is mandatory. Stay off PQ-129 renderer files.

```text
This is a campaign: raise live 3D objects to one quality bar. Do not use INFERENCE. Do not take hitch/PQ-129 work. Do not stop after one unit.

Law: design/program/GRAPHICS_3D_CAMPAIGN.md and docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md. Camera is the 60° chase at 144 WU (close 58 WU). Capture with tools/blender/spaceface_chase_camera.py. No seats, no studio three-quarter, no cabin kits.

Bar: Hitch / Helios wholeships at chase size. A tube+ring next to a real ship is a fail. Variable quality is worse than a slightly softer house style. Do not dump Hitch down.

Another thread owns hitch smoothness. Stay off src/render/renderer.js, precompile.js, partsLibrary.js, bloom.js, pipelineReadiness.js, opaqueMaterialBatch.js, visualOverrides.js, scenarioProps47a.js, hitchClassifier.js, program-queue.json, and Hitch/Kestrel files. Author assets. Same-slot GLB replace is allowed. Do not add shader families.

Order:
1. Nav buoy + lane beacon (repeating satellites).
2. pod_cargo_container.
3. 47-A evidence spindle as a candidate GLB only — do not hook scenarioProps47a.js until hitch work is idle.
4. Mining drone + conveyor barge.
5. Hornet skin+wells in fleet_player_bodies_v1/hornet only. Do not run the all-fleet promote. Do not model a cabin.

Each unit: reference first (imagen, or existing reference/, or Codex terminal handoff in AGENT_PROMPTS.md § E). One skin with holes, not glued boxes. Join by material. Dry-run chase_visible_faces.py. Chase stills vs Hitch. Commit that unit, then the next.

Default bloom/shadows/particles stay on. Do not pass by making the mesh cheaper-looking.

RESULT: DONE when units 1–4 are on master and Hornet has a chase-camera candidate. Leave 47-A unwired if hitch still owns scenarioProps47a.js.
```

## Prompt A0-W — Asteroid Works / mining minigame unreadable or ugly

Copy `ASTEROID_WORKS_PLAYFIELD_GOAL.txt` as the whole prompt. Do not paraphrase.
The design law and campaign files it names are mandatory.

```text
This is a campaign: put the player inside the asteroid and rebuild the screen's look from the ground up. The mine is the screen. Do not use INFERENCE. Do not take hitch/PQ-129 or PQ-050. Do not stop after one unit.

Law: design/ASTEROID_WORKS_DESIGN_LAW.md is the positive target — read §2 rulings and §3 art direction first, then your leaf's sections; its hex, type, px, and ms values are law, and its §11 invariants are how a no-vision agent proves a leaf. Campaign bans: design/program/ASTEROID_WORKS_PLAYFIELD.md §0 spirit and §3 vanilla collapse. Chrome idea: design/frontend/SCREENS_E_ASTEROID_WORKS.md. Dispatch: node scripts/program-dispatch.mjs --id PQ-130. Take the first claimable leaf. --next still returns fleet remaster.

Owner rulings 2026-08-20: the board is a perfect axis-aligned chess grid (zero tilt); fog of war is removed — every cell's material visible from the first frame; the current chrome is "gray, bleak, and vibe-coded, harsh fonts" and is DELETED, not restyled — warm palette, vendored Instrument Sans / Spline Sans Mono / Bricolage, sentence case, no uppercase transforms, soft shapes; events happen on the board with sound, never as a permanent text log; at most 15 visible words in the default drive view; board >= 88% of the glass.

A polished copy of the gunmetal console fails ("a polished turd"). A vanilla collapse fails: shorter CSS bays, zoom-only camera, tan x0.7, bigger sparkles, slower MOVE_COOLDOWN, truncated inspector strings, restyled gray keys. If that is the PR, you have not started.

Order:
1. PQ-130.01 Theater — board sovereign; crest + rig cluster only; new visual language lands here; flat grid; two zoom registers; one shared render/grading pipeline.
2. PQ-130.02 Surgical drive — tap seats one cell; hold delay then cruise; visible bore bite; rewrite check-drill-smooth.
3. PQ-130.03 This asteroid's rock — warm mineral palette; dusk lighting (warm key inside, cool rim outside).
4. PQ-130.04 Cells speak — three-channel material identity; seams as outlined bodies with counts and split preview; fog gate off.
5. PQ-130.05 The vehicle — the safety-yellow rover; bit heat glow; visible hopper fill.
6. PQ-130.06 Hover as instrument — cursor lens beside the pointer; context bay deleted.
7. PQ-130.07 The sim speaks — every event on the board per law §5; ledger becomes a silent drawer.
8. PQ-130.08 The mine's voice — own soundscape per law §8; music bus not zeroed on this screen.
9. PQ-130.09 Build like chess — earned palette keys; ghost placement with valid-face glow and why-glyphs.
10. PQ-130.10 The site reads — cables/lanes/lamps/want-chips/port crates/courier launch; site-zoom return.

Stay off hitch renderer files, Hitch/Kestrel, Waves 1-4 sim (formations/thermal/signature/cluster), courier economy, claim persistence. No camera-facing soft squares. No quality cuts.

Each leaf: play tether -> Asteroid Works at a normal window. Whole-theater stills, not cube crops. Prove the law §11 invariants that apply. check:playable after implementation. Commit only that leaf, then the next.

RESULT: DONE when a stranger sees warm rock and a vehicle first, tells ore/gas/stone apart with the lens closed, moves one cell on purpose, hears the mine, and the leftover chrome is friendly field equipment they would touch — not a gray console.
```

## Prompt A0-WA — Asteroid Works objects are procedural stand-ins

Copy `ASTEROID_WORKS_ART_GOAL.txt` as the whole prompt. Do not paraphrase. The campaign,
technique contract and review workflow it names are mandatory. Needs Blender (MCP bridge or
headless). Take `PQ-131.00` (loader + works camera) first; every asset unit depends on it.

```text
This is a campaign: replace every procedural stand-in object in the Asteroid Works mine with an authored asset at the flight ships' bar. Do not use INFERENCE. Do not take hitch/PQ-129 or PQ-050. Do not stop after one unit.

Law: design/program/ASTEROID_WORKS_ART_CAMPAIGN.md + docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md + docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md + design/ASTEROID_WORKS_DESIGN_LAW.md section 2.7. Dispatch: node scripts/program-dispatch.mjs --id PQ-131. Take the first claimable unit.

Bar: Hitch / Helios wholeships at play size through the works camera (straight down, 31 degrees, ~120 px per cell at 1080p; 19 px at the site register). A works still beside a flight still must read as the same game. A procedural stand-in is scaffolding, never acceptance.

Order: .00 loader + works camera; .01 rover; .02 Core; .03 extractor; .04 refinery; .05 derrick; .06 conduit kit; .07 gas tap; .08 fabricator; .09 port + crates + pod; .10 inclusion kit.

Each unit: reference first; Blender blockout at works scale; one skin with holes; unique UVs, bakes, authored PBR; LOD0+LOD1; scripts/build-hull-release-assets.mjs; manifest entry; wire through loadWorksPart with the named hooks and delete the procedural builder; works-camera stills beside a flight still; three subagent reviews listing every defect at play size; revise until KEEP; commit only that unit, then the next. check:asteroid-theater and check:playable stay green. No quality cuts, no billboards, no emissive outlines, no scaled box stacks.

RESULT: DONE when every inventory row is an authored, reviewed, wired asset on master.
```

## Prompt A0 — overnight / “the work in the build map” / non-INFERENCE

```text
This is a campaign, not one task. Start at CANONICAL_BUILD_MAP.md. Do not use
INFERENCE_CONVERGENCE_METHOD.md or INFERENCE_LANES.md unless the user said INFERENCE.

The fleet remaster campaign is PQ-050 (its packet owns its law). Run
`node scripts/program-dispatch.mjs --id PQ-050`, take the first claimable ship, follow
ADVANCED_MODEL_TECHNIQUE_CONTRACT.md and MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md.
Each ship: follow design/program/roadmap/active/PQ-050.md (its cycle and review law).
(play_chase D=144, play_chase_abeam, play_chase_close D=58 from
tools/blender/spaceface_chase_camera.py); reviews as PQ-050.md prescribes.
obvious defect at play size; implement all revises that read on the chase camera;
then do the whole ship again. Zoomed gray plates, studio three-quarters, and seats
do not count. Clean up old stills before commit. Wire only that ship, then the next.
Do not stop after one ship. Do not touch Hitch. Do not model a cabin.
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

Implement the selected outcome, run its focused proof, obtain the required independent agent review,
stage only its exact files, commit, fetch, push the current branch explicitly, update its receipt/status
truthfully, and remove the NOW row. If another thread has an exact dirty hunk, preserve that hunk and
continue on disjoint work or take the next returned task; if its checkpoint is stale, adopt it rather
than working around it. Do not declare the packet or repo blocked, ask for a human verdict, or loop on
an unchanged failing command.

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
unit's player outcome. Before mutation, initialize the checkpoint described above. If the unit is not yet printed by `--ready`, its `dependsOn` list is integration
order, not permission to forget the task: complete any missing in-repo prerequisite needed to deliver
the assigned outcome, and do not mark the unit done until the full result is integrated. Do not create
a worktree and do not stop because another task exists. Record a
NOW row only during mutation. Preserve any exact foreign dirty hunk; continue the disjoint parts and
adopt a stale checkpoint for a genuinely overlapping hunk instead of creating a parallel copy.

Keep working until the outcome is implemented, focused proof is green, required route/independent-agent
review evidence is honest, and the exact files are committed and pushed. Update the receipt and task
state. End with the DONE/NOT DONE template from design/program/02_REMAINING_WORK.md, then stop.
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

The final `PQ-045.human-review` is an independent-agent review task. Use the candidate-bound evidence,
record KEEP or REVISE with the reviewing thread identity, and do not wait for a human verdict.
