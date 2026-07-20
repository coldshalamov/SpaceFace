---
id: "SF-35"
sequence: 35
status: "ready"
difficulty: "hard"
discipline: "program"
frontend_difficulty: "hard"
vision_requirement: "yes"
recommended_agent_profile: "Top-tier release/integration agent with browser/Electron, profiling, accessibility, and vision capability"
depends_on: ["SF-33", "SF-34"]
roadmap_alignment: "R08\u2013R18, M0\u2013M6 exit evidence, release gate"
prompt_system_version: "1.0"
terminal_gate: "ready-for-review with receipt; global completion remains lead-owned"
---

# SF-35 — [HARD][PROGRAM][FRONTEND-HARD][VISION-YES] Final Save, Performance, Platform, Accessibility, and Release Closeout

<agent_assignment>
  <role>Top-tier release/integration agent with browser/Electron, profiling, accessibility, and vision capability</role>
  <recommended_routing>A vision-capable frontend/3D/game-feel agent is required for final player-facing acceptance. A backend/no-vision agent may help with pure kernels, but must not self-sign visual quality.</recommended_routing>
  <operating_mode>Autonomous bounded implementation. Audit, implement, verify, and return the receipt in this run; do not stop at planning.</operating_mode>
<pseudo_skills>
  <skill name="live-repository-truth-reconciliation">Reconcile git identity, current checks, public routes, ledgers, and stale plan claims without importing historical completion.</skill>
  <skill name="shared-tree-integration-safety">Preserve concurrent work, reason about path and semantic mutexes, and produce recoverable receipts.</skill>
  <skill name="acceptance-architecture">Distinguish implementation, focused proof, player-route proof, visual proof, and integration.</skill>
</pseudo_skills>
</agent_assignment>

<mission>
One current revision is a reproducible release candidate: saves/migrations/recovery, browser/Electron/package parity, accessibility, visual identity, performance/memory, long soak, evidence, licensing, and honest store captures all bind to the same build with no unknown red.
</mission>

<fresh_thread_context>
You are working in the live `coldshalamov/SpaceFace` repository. SpaceFace is a Three.js browser/Electron top-down space game with a fixed-timestep simulation, a flat serializable `GameState`, an event bus, registry-ordered systems, Rapier-dynamic physics behind a physics-authority membrane, Flight V3 as the default flight path, tactical AI as the default AI path, data-driven content, a DOM/CSS overlay UI, and browser/Electron launch parity.

The product direction is not “add more named content.” It is to turn SpaceFace’s broad but uneven systems into a coherent game whose signature is assisted relational physics, an inhabited world, and industrial transformation:

- the player chooses target, direction, risk, timing, and strategy;
- the flight computer supplies bounded precision, never hidden strategy;
- physical displacement, constraints, fields, collisions, components, routes, and persistent world changes create the interesting play;
- mining and automation build traversal, defense, logistics, sites, and world-changing infrastructure—not merely passive credits or a higher-DPS gun;
- content must be embodied through visible actors, structures, traffic, state changes, consequences, and normal player routes.

A repository snapshot taken on 2026-07-19 found that the live tree was already substantially ahead of the original planning conversation. At that snapshot:

- `master` included Atlas/map/travel work, a major graphics checkpoint, and an integrated graphics/performance checkpoint.
- Massline orbit telemetry, invariant vocabulary, target scoring, capture/attach plumbing, release ratings, reel/pump checks, arc data, whip impact, impulse-charge combinations, and other partial machinery existed.
- The live latch path was still largely cursor/ray dominated; turn-direction intent and pre-latch preview were not yet a complete player-facing acquisition grammar.
- Flight V3 increased tethered helm authority but did not yet prove a bounded radial/tangential orbit controller that reliably expresses “hold thrust plus turn to orbit.”
- The experimental G/trackpad mode still followed sampled world-space path points and was a known risk for flailing, mixed-reference-frame behavior.
- Graphics foundations, authored asset admission, Kestrel/RCS, Helios surfacing, representative geology, and typed combat/world visual identities had landed, but current natural-route, Electron, GPU, crowded-scene, and visual-family acceptance remained incomplete.
- The program documents could lag the actual branch. Live code, current checks, public-route evidence, and current git identity outrank this snapshot.

Treat every statement above as a lead to re-check, not as permission to assume it remains true.
</fresh_thread_context>

<authority_and_repo_safety>
Apply this authority order whenever sources disagree:

1. The user’s current instruction and this prompt’s bounded outcome.
2. Root `AGENTS.md` and the nearest nested `AGENTS.md` files governing touched paths.
3. `ARCHITECTURE.md`.
4. `design/GDD_2_0.md`.
5. `design/program/NOW.md`, `design/program/README.md`, the active 113-packet roadmap, and the execution protocol.
6. The activated subsystem plan/spec and supporting planning packages.
7. Historical plans, transcripts, campaign material, old summaries, and this prompt’s dated snapshot.

Before editing, run or equivalent:

- `pwd`
- `git log -1 --oneline`
- `git status --short`
- `git diff -- <every candidate owner file>`
- `git rev-list --left-right --count origin/master...HEAD`
- inspect active worktrees/branches when relevant

Do not reset, restore, checkout, clean, stash, force-push, discard, overwrite, or “tidy” unrelated work. A branch name alone is not isolation. If the shared tree is dirty in an expected owner path and the prompt does not explicitly grant that path, stop editing that path, preserve the evidence, and continue only on independent work.

Do not edit compatibility implementations as a shortcut when the live route uses Flight V3, tactical AI, or Rapier-dynamic. Do not create a second writer for position, velocity, credits, cargo, reputation, derived stats, save normalization, input actions, registry order, or runtime asset identity.

Do not alter expected/golden data merely to make a check pass. A justified re-record is a separate, explicit product decision with before/after evidence.

Only the lead/status integrator edits `design/program/NOW.md`, global completion claims, the shared Git index, or shared-tree commits. Unless the user explicitly grants an isolated worktree and commit authority, return an uncommitted logical diff and receipt. This prompt system authorizes you to update only the current prompt file and its matching receipt inside this prompt-pack workflow.
</authority_and_repo_safety>

<engineering_invariants>
- Simulation uses the XZ plane, the fixed simulation timestep, `state.rng`, and `state.simTime`; no ambient simulation randomness or wall-clock decisions.
- Continuous forces and impulses route through physics authority. Do not directly assign live Rapier body transforms or velocity from gameplay systems.
- Browser, Electron, packaged builds, probes, and acceptance routes share one gameplay entrypoint, defaults, assets, and state semantics.
- Player-facing work is not complete because code/data/assets/tests exist. It must be reachable through the declared normal route, with current revision identity and current evidence.
- Persisted state uses stable IDs, bounded schemas, safe defaults, migration/normalization where required, and deterministic save/Continue behavior.
- Input assistance interprets probable intent and supplies precision; it must not choose the player’s strategy, aim weapons secretly, select a route, or play a maneuver as a kinematic animation.
- Manual override must be immediate and legible. Every controller has explicit reference frames, bounded outputs, deadbands/hysteresis where needed, and telemetry sufficient to diagnose disagreement between intent and actual motion.
- Visual identity, collision, targeting, interaction, and gameplay classification must agree. A beautiful structure around an unrelated central circle is a failed implementation.
- Performance work removes invisible work, allocations, duplicated passes, fragmented resources, and bad cadence. It may not pass by deleting authored content, reducing default quality, or lowering entity counts without an explicit product decision.
- Accessibility preserves critical information under reduced motion/flash, keyboard, mouse/trackpad, gamepad, text scale, focus, contrast, and non-color cues.
- Status terms remain distinct: `IMPLEMENTED`, `FOCUSED_GREEN`, `ROUTE_ACCEPTED`, `VISUALLY_ACCEPTED`, and `INTEGRATED` are not synonyms for “done.”
</engineering_invariants>

<agentic_work_style>
Do not stop after producing a plan. In this same run, perform the audit, establish the current baseline, implement the smallest coherent vertical slice, verify it in layers, inspect the entire intended diff, and return a receipt. Ask no question whose answer can be obtained from the repository, current checks, included reference material, or a bounded experiment.

Use the loop:

1. Gather current evidence.
2. Separate findings into `confirmed`, `inferred`, and `unknown`.
3. Re-prove the player/system gap before editing.
4. Establish a failing test, characterization, or same-framing visual baseline appropriate to the task.
5. Implement through existing authorities and ports.
6. Verify pure behavior, integration, save/determinism, public route, visual result, accessibility, and performance in proportion to risk.
7. Review the diff for foreign paths, duplicated ownership, hidden feature flags, stale fixtures, and placeholder substitutions.
8. Return exact commands, results, artifact paths, revision identity, limitations, and follow-ons.

If the requested outcome is already genuinely satisfied in the current tree, do not invent replacement scope. Prove the existing behavior, classify the prompt `ALREADY_SATISFIED`, document what made the dated premise obsolete, write the receipt, and move the prompt to review.
</agentic_work_style>

<sequence_position>
  <prompt_id>SF-35</prompt_id>
  <declared_dependencies>SF-33, SF-34</declared_dependencies>
  <roadmap_alignment>R08–R18, M0–M6 exit evidence, release gate</roadmap_alignment>
  <sequence_rule>This prompt is sequential, but the live repository may have advanced. Re-audit all prerequisites. Do not replay an obsolete task merely because its prompt number has arrived.</sequence_rule>
</sequence_position>

<dependency_gate>
  <dependency>SF-33</dependency>
  <dependency>SF-34</dependency>
  <required_action>Read each dependency receipt and inspect the current code/checks that receipt described. A historical green result does not survive intervening owner changes automatically.</required_action>
  <block_policy>Do not absorb a missing prerequisite into this task. Complete independent audit/test work, then return an exact blocker or shared-change request.</block_policy>
</dependency_gate>




<problem>
Large agent-built games often end with a forest of focused greens, stale screenshots, ignored artifacts, partial save semantics, launcher divergence, and unknown reds. Release cannot be a prose conclusion or a gallery from several branches.
</problem>

<consequences_of_the_problem>
If this gap remains, later features will either duplicate weak abstractions, hide failure behind presentation, or make player input less trustworthy. Treat the causal problem above—not merely its visible symptom—as the unit of work.
</consequences_of_the_problem>

<why_this_is_cool_and_worth_building>
This final prompt turns the system into a product. It does not add features; it proves that the game players receive is the game the plans describe, and that failure modes—corrupt saves, alt-tab, resize, context loss, long sessions, dense scenes—do not unravel it.
</why_this_is_cool_and_worth_building>

<player_observable_checkpoint>
At the end of this prompt, a reviewer must be able to demonstrate this outcome through the declared route:

One current revision is a reproducible release candidate: saves/migrations/recovery, browser/Electron/package parity, accessibility, visual identity, performance/memory, long soak, evidence, licensing, and honest store captures all bind to the same build with no unknown red.

The checkpoint must be coherent and recoverable. It may leave later breadth for future prompts, but it may not leave the primary result as data-only, debug-only, UI-only, or default-off.
</player_observable_checkpoint>

<scope>
  <mandatory_deliverables>
  <deliverable>Freeze feature scope for the release candidate and reconcile every prior receipt, roadmap mapping, acceptance matrix row, active worktree/branch, known red, and evidence artifact against current revision.</deliverable>
  <deliverable>Run/repair save schema, migrations, old saves, corrupt/truncated/interrupted autosaves, slots, Continue, active tethers/fields/sites/jobs/story/endings, and safe recovery.</deliverable>
  <deliverable>Run/repair browser, Electron, and packaged parity across New Game, Continue, corridor, signature mechanics, ending/sandbox, settings, assets, and cleanup.</deliverable>
  <deliverable>Profile startup, headed frame pacing, sim/callback cost, GPU state, draw calls, asset residency/decoders, memory/heap, autosave, dense combat/world, travel, menus, repeated sector transitions, context loss, and long soak on target and floor hardware where available.</deliverable>
  <deliverable>Close accessibility: rebinds, keyboard/mouse/trackpad/gamepad, focus, text scale, contrast, non-color cues, reduced motion/flash, localization/pseudo-locale, screen lifecycle.</deliverable>
  <deliverable>Reconcile asset classifications, manifests, provenance/licenses, exact runtime identity, LOD/proxy/interaction, disposal, and no-placeholder admission.</deliverable>
  <deliverable>Repair evidence records so hashes/schema/status/current routes are valid; promote compact durable manifests where ignored local media would otherwise vanish.</deliverable>
  <deliverable>Produce honest store captures/copy from the accepted build in browser/Electron/package routes with current revision/settings and provenance.</deliverable>
  <deliverable>Run the final release gate; classify every failure. No unknown red, stale pin, unowned workaround, missing evidence, orphan process, or hidden feature flag remains.</deliverable>
  <deliverable>Update authoritative program ledgers through the lead/integrator and archive the prompt queue/receipts as the release execution record.</deliverable>
  </mandatory_deliverables>
  <explicit_non_goals>
  <non_goal>No new feature, content family, visual redesign, or speculative optimization.</non_goal>
  <non_goal>No lowering defaults, deleting visuals, shrinking scenes, disabling systems, or waiving red without explicit documented product decision.</non_goal>
  <non_goal>No mixing evidence from different revisions.</non_goal>
  </explicit_non_goals>
</scope>

<mandatory_live_audit>
Before changing code, inspect the live owner paths, imports, registry order, feature flags/defaults, relevant dirty diffs, tests, public routes, save surface, and evidence. Classify each dated premise as `confirmed`, `partially-confirmed`, `obsolete`, `not-reproduced`, or `blocked`.

Use these research anchors as starting points, not brittle file instructions:
  <anchor>R08–R18 roadmap, live acceptance matrix, evidence validators, release capture pipeline, save schema/migrations.</anchor>
  <anchor>All prior prompt receipts, launch/package/asset/perf/accessibility/localization and program status owners.</anchor>

Return a concise working audit containing:
- live owner and consumer map;
- what already exists and its highest proven status;
- exact missing primitive or player-route gap;
- path and semantic mutexes;
- baseline evidence;
- smallest coherent implementation boundary.

Then continue directly into implementation.
</mandatory_live_audit>

<implementation_direction>
  <direction>Diagnose measured owners; do not patch whichever central file is convenient.</direction>
  <direction>Use one release build identity and immutable artifact hashes across tests/captures.</direction>
  <direction>Keep failed commands in receipts even after repair; show chronology and final rerun.</direction>
  <direction>Separate platform/driver/tooling limitations from product defects and name untested claims.</direction>
  <direction>Require independent visual/accessibility/release review where available.</direction>
</implementation_direction>

<acceptance_contract>
  <criterion>All declared release-critical routes pass on one current revision in browser, Electron, and packaged build, or an explicit user-approved platform exception is documented.</criterion>
  <criterion>Save/migration/corruption/Continue matrix passes with clear recovery and no duplication/loss.</criterion>
  <criterion>Performance/memory/residency/soak meet declared targets without quality reduction or leaks.</criterion>
  <criterion>Accessibility/localization/settings/device-switch/resize/alt-tab/context-loss behaviors pass.</criterion>
  <criterion>Assets/evidence/licenses/store media are current, hash-bound, reachable, and honest.</criterion>
  <criterion>Final gate reports no unknown red, stale pin, missing evidence, active lease, unreviewed workaround, or orphan process.</criterion>
  <criterion>Program ledgers distinguish accepted outcomes from retained future backlog.</criterion>
  <status_rule>Do not collapse criteria into “done.” Report the highest state actually reached and the evidence missing for the next state.</status_rule>
</acceptance_contract>

<anti_placeholder_and_failure_mode_contract>
The implementation fails review if any of the following occur:
  <failure>Calling focused tests a release.</failure>
  <failure>Using screenshots from older branches/builds.</failure>
  <failure>Waiving Electron/package parity because browser works.</failure>
  <failure>Passing performance by disabling authored presentation.</failure>
  <failure>Deleting or regenerating saves/goldens to avoid migration work.</failure>
  <failure>Unknown red classified as flaky without reproduction evidence.</failure>
  <failure>Store capture staged with injected state or nonshipping assets.</failure>
  <failure>Editing a legacy/compatibility implementation instead of the live registry/default path.</failure>
  <failure>Creating a second writer or shadow state because the existing owner looked inconvenient.</failure>
  <failure>Technically satisfying the words with a sphere, central collider, label, toast, timer, hidden autopilot, or debug-only route.</failure>
  <failure>Using direct position/velocity mutation, kinematic playback, or state injection to imitate a physical mechanic.</failure>
  <failure>Keeping the feature default-off or unreachable while calling it complete.</failure>
  <failure>Passing a source-pattern/unit check without proving the declared normal player route.</failure>
  <failure>Rewriting expected/golden output without an explicit, evidence-backed re-record decision.</failure>
  <failure>Breaking save/Continue, reload determinism, browser/Electron parity, or old-save defaults.</failure>
  <failure>Adding unbounded entities, particles, receipts, listeners, allocations, or all-pairs queries.</failure>
  <failure>Reducing visual quality, density, or content to pass performance rather than fixing measured cost.</failure>
  <failure>Making critical meaning color-only, motion-only, tiny at gameplay zoom, or inaccessible by keyboard/gamepad.</failure>
  <failure>Touching foreign dirty paths, global status, shared index, manifests, registry, input, save, or common styles without the recorded authority.</failure>
</anti_placeholder_and_failure_mode_contract>

<verification_plan>
Verify in layers, retaining every failure and its classification:
1. New pure/unit/contract or characterization proof.
2. Owning subsystem aggregate.
3. Risk-triggered determinism, simulation compare, save/migration/Continue, launch, asset, UI/accessibility, and performance checks.
4. Normal browser route for every player-visible behavior.
5. Electron route when runtime, input, rendering, assets, save, or launch parity is relevant.
6. Current media and independent vision review when `VISION-YES` or `VISION-RECOMMENDED`.
7. `git diff --check`, `git status --short`, exact diff review, revision identity, and cleanup.

Task-specific required verification:
  <verification>Complete release matrix: unit/contracts, sim/replay, save/migrations/corruption, public routes, browser/Electron/package, accessibility/localization, assets/visual, performance/memory/soak, cleanup.</verification>
  <verification>Independent review of current normal-route media and store captures.</verification>
  <verification>ZIP/archive/evidence hash validation and final clean status/commit identity.</verification>
</verification_plan>

<required_final_report>
Return these sections, with exact facts rather than confidence language:

1. `Player-visible/system outcome`
2. `Current-state audit findings` — confirmed/inferred/unknown and obsolete assumptions
3. `Authorities and paths touched`
4. `Implementation design` — reference frames, state machines, data shapes, equations or pseudocode where material
5. `Exact public input/route`
6. `Checks and commands` — exit status, counts, artifact paths
7. `Browser/Electron/visual evidence`
8. `Determinism/save/performance/accessibility evidence`
9. `Known failures and unproven claims`
10. `Shared change requests`
11. `Revision/worktree identity`
12. `Next bounded dependency`, not a broad wishlist

Write this receipt shape to `receipts/SF-35.yaml`:

```yaml
packet: SF-35
prompt_file: <current filename>
agent: <agent or task id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
worktree: <absolute path>
state_reached: <ALREADY_SATISFIED|IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|VISUALLY_ACCEPTED|BLOCKED>
dependencies_seen:
  - SF-33
  - SF-34
paths_changed: []
shared_change_requests: []
proof:
  - command: <exact command>
    result: <exit code and passed/failed counts>
public_route:
  status: <not-required|not-run|pass|fail>
  route: <ordinary inputs and milestones>
  artifacts: []
visual_review:
  required: true
  status: <not-required|pending|pass|fail>
performance:
  status: <not-required|pending|pass|fail>
  metrics: {}
known_failures: []
unproven_claims: []
follow_ons: []
```

</required_final_report>

<completion_and_file_movement_protocol>
This prompt is part of a sequential controller workflow.

At the start:
- Read `../README.md`, `../SEQUENCE_MATRIX.md`, `../WORKFLOW_AND_REVIEW_PROTOCOL.md`, and all receipts for declared dependencies.
- Confirm every dependency has a receipt whose state is at least the dependency’s required gate.
- If a dependency is absent, stale, contradicted by current code, or only “implemented” when this task requires route acceptance, record `BLOCKED_BY_DEPENDENCY` rather than silently compensating inside this task.

During work:
- Tick checklist items only when current evidence supports them.
- Write the machine-readable receipt at `receipts/SF-35.yaml`.
- Do not edit any other prompt file or another task’s receipt.
- Do not mark global roadmap packets complete; report mappings and evidence to the lead.

On successful completion or evidence-backed `ALREADY_SATISFIED`:
1. Update this file’s frontmatter `status` to `ready-for-review`.
2. Fill the completion record at the end of this file.
3. Move this exact prompt from `plans/` to `review/`, preserving its filename. Use `git mv` only when the prompt pack is tracked and the current worktree policy permits it; otherwise use an ordinary file move.
4. Leave the implementation diff and receipt ready for the reviewer/integrator.
5. Do not start the next prompt.

On a genuine blocker:
- Keep the prompt in `plans/`.
- Set status to `blocked`.
- Write a receipt naming the exact blocker, evidence, safe independent work completed, and the narrowest unblocking action.
</completion_and_file_movement_protocol>

## Completion record

- [ ] Live owner/default route re-audited and dated assumptions classified.
- [ ] Dependency receipts verified at the required gate.
- [ ] Baseline or red/characterization evidence captured before edits.
- [ ] Bounded implementation completed through existing authorities.
- [ ] Focused tests/checks passed or retained failures precisely classified.
- [ ] Determinism/save/Continue checks completed where applicable.
- [ ] Declared browser/Electron/player route completed where applicable.
- [ ] Visual/accessibility/performance evidence completed to the task’s risk level.
- [ ] Entire intended diff reviewed; no foreign paths, hidden defaults, stale goldens, or placeholder substitutions.
- [ ] Receipt written to `receipts/SF-35.yaml`.
- [ ] Prompt status changed to `ready-for-review` and file moved from `plans/` to `review/`.

**Execution summary:**  
_Fill only with evidence-backed facts._

**Reviewer attention:**  
_List the highest-risk assumptions, interfaces, and visual/feel judgments the reviewer should challenge._
