---
id: "SF-13"
sequence: 13
status: "ready"
difficulty: "hard"
discipline: "systems"
frontend_difficulty: "medium"
vision_requirement: "recommended"
recommended_agent_profile: "Strong systems/combat agent; vision review recommended for statuses"
depends_on: ["SF-12"]
roadmap_alignment: "Physics combat progression; setup/payoff grammar; later planetary capture"
prompt_system_version: "1.0"
terminal_gate: "ready-for-review with receipt; global completion remains lead-owned"
---

# SF-13 — [HARD][SYSTEMS][FRONTEND-MEDIUM][VISION-RECOMMENDED] Mass-Coupling Tactics: Inertial Shunt, Gravity Mark, and Momentum Sink

<agent_assignment>
  <role>Strong systems/combat agent; vision review recommended for statuses</role>
  <recommended_routing>A backend/no-vision agent can implement the structural slice, but a vision-capable reviewer should perform player-camera acceptance before the prompt is considered visually accepted.</recommended_routing>
  <operating_mode>Autonomous bounded implementation. Audit, implement, verify, and return the receipt in this run; do not stop at planning.</operating_mode>
<pseudo_skills>
  <skill name="deterministic-gameplay-systems">Design fixed-step, finite, replay-safe kernels and adapters with explicit reference frames.</skill>
  <skill name="physics-authority-integration">Route forces, impulses, constraints, contacts, and body commands through the live Rapier authority.</skill>
  <skill name="input-and-control-engineering">Build bounded intent interpretation, deadbands, hysteresis, immediate override, and telemetry.</skill>
  <skill name="mutation-resistant-testing">Create invariant, contract, differential, and public-route tests that fail on plausible wrong implementations.</skill>
</pseudo_skills>
</agent_assignment>

<mission>
The player can alter how a target responds to impulse/fields, selectively increase field coupling, or remove velocity relative to an explicit frame—creating setup tools rather than damage upgrades.
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
  <prompt_id>SF-13</prompt_id>
  <declared_dependencies>SF-12</declared_dependencies>
  <roadmap_alignment>Physics combat progression; setup/payoff grammar; later planetary capture</roadmap_alignment>
  <sequence_rule>This prompt is sequential, but the live repository may have advanced. Re-audit all prerequisites. Do not replay an obsolete task merely because its prompt number has arrived.</sequence_rule>
</sequence_position>

<dependency_gate>
  <dependency>SF-12</dependency>
  <required_action>Read each dependency receipt and inspect the current code/checks that receipt described. A historical green result does not survive intervening owner changes automatically.</required_action>
  <block_policy>Do not absorb a missing prerequisite into this task. Complete independent audit/test work, then return an exact blocker or shared-change request.</block_policy>
</dependency_gate>




<problem>
Changing raw physical mass everywhere is scientifically tempting and architecturally dangerous: it can destabilize Rapier, constraints, AI, and save behavior. Yet the game needs ways to make heavy targets flingable, make selected enemies vulnerable to wells, and capture fast bodies without setting velocity to zero.
</problem>

<consequences_of_the_problem>
If this gap remains, later features will either duplicate weak abstractions, hide failure behind presentation, or make player input less trustworthy. Treat the causal problem above—not merely its visible symptom—as the unit of work.
</consequences_of_the_problem>

<why_this_is_cool_and_worth_building>
These tools turn physics into a build language. A player may prefer lightening and throwing, marking and gathering, or sinking momentum for capture. The style emerges from combinations rather than a menu asking “choose gravity class.”
</why_this_is_cool_and_worth_building>

<player_observable_checkpoint>
At the end of this prompt, a reviewer must be able to demonstrate this outcome through the declared route:

The player can alter how a target responds to impulse/fields, selectively increase field coupling, or remove velocity relative to an explicit frame—creating setup tools rather than damage upgrades.

The checkpoint must be coherent and recoverable. It may leave later breadth for future prompts, but it may not leave the primary result as data-only, debug-only, UI-only, or default-off.
</player_observable_checkpoint>

<scope>
  <mandatory_deliverables>
  <deliverable>Define bounded, serializable response modifiers for impulse response, tether response, field/gravity coupling, and control/inertia semantics without indiscriminately changing body mass.</deliverable>
  <deliverable>Implement Inertial Shunt with at least `lightened` and `ballasted` modes or a carefully scoped equivalent; define target class resistance, stacking, duration, source ownership, and recovery.</deliverable>
  <deliverable>Implement Gravity Mark that selectively increases artificial/natural field coupling without direct damage.</deliverable>
  <deliverable>Implement Momentum Sink that reduces velocity relative to an explicit frame (player, selected anchor/planet, convoy/station) by applying bounded opposing force/impulse through authority.</deliverable>
  <deliverable>Integrate status application, UI/target panel, VFX, audio, combat trace, save/Continue, AI response, cleansing/expiry, and progression data.</deliverable>
  <deliverable>Provide combination fixtures with Concussion, Mass Seed well, repulsor, tether, and a heavy target.</deliverable>
  </mandatory_deliverables>
  <explicit_non_goals>
  <non_goal>No global time slow, hard stun, or velocity assignment.</non_goal>
  <non_goal>No arbitrary stacking that creates singular responses.</non_goal>
  <non_goal>No full status-effect framework rewrite unless a proven ownership gap requires a narrow extraction.</non_goal>
  </explicit_non_goals>
</scope>

<mandatory_live_audit>
Before changing code, inspect the live owner paths, imports, registry order, feature flags/defaults, relevant dirty diffs, tests, public routes, save surface, and evidence. Classify each dated premise as `confirmed`, `partially-confirmed`, `obsolete`, `not-reproduced`, or `blocked`.

Use these research anchors as starting points, not brittle file instructions:
  <anchor>SF-09 response coefficients, SF-12 field coupling, status/effect ownership, target panel and combat trace.</anchor>
  <anchor>Flight/AI actuator profiles and save normalization.</anchor>

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
  <direction>Keep response dimensions explicit and clamp composed modifiers; use stable source/status IDs.</direction>
  <direction>Momentum Sink frame must be visible and machine-readable; relative velocity is computed against the declared frame velocity.</direction>
  <direction>Apply forces over time or bounded impulses with energy/cooldown costs, not silent scalar edits.</direction>
  <direction>Heavy/capital targets may require component disable or multiple setup actions; encode resistance in data.</direction>
  <direction>Status presentation must communicate physical consequence, remaining duration, and immunity/resistance without clutter.</direction>
</implementation_direction>

<acceptance_contract>
  <criterion>Lightened targets move farther under identical Concussion while body/contact stability remains intact.</criterion>
  <criterion>Ballasted mode improves anchor/knockback resistance with an explicit maneuverability cost.</criterion>
  <criterion>Gravity Mark changes well response but does not alter ordinary weapon damage.</criterion>
  <criterion>Momentum Sink captures or slows relative to the selected frame and behaves differently when the frame moves.</criterion>
  <criterion>Stacking/expiry/save/reload are deterministic and bounded.</criterion>
  <criterion>At least three combined tactics work in the normal combat route against light, medium, and heavy classes.</criterion>
  <status_rule>Do not collapse criteria into “done.” Report the highest state actually reached and the evidence missing for the next state.</status_rule>
</acceptance_contract>

<anti_placeholder_and_failure_mode_contract>
The implementation fails review if any of the following occur:
  <failure>Changing `entity.mass` and hoping every subsystem behaves.</failure>
  <failure>Momentum Sink as `vel = 0`.</failure>
  <failure>Gravity Mark as generic slow/debuff.</failure>
  <failure>Infinite multiplicative stacking.</failure>
  <failure>Status icons with no visible physical behavior.</failure>
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
  <verification>Pure composition/frame-relative tests, caps, expiry, stacking order independence, class resistance.</verification>
  <verification>Physics/combat trace, sim compare, save/migration, AI and public combo routes.</verification>
  <verification>UI/a11y/visual review and dense-status performance.</verification>
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

Write this receipt shape to `receipts/SF-13.yaml`:

```yaml
packet: SF-13
prompt_file: <current filename>
agent: <agent or task id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
worktree: <absolute path>
state_reached: <ALREADY_SATISFIED|IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|VISUALLY_ACCEPTED|BLOCKED>
dependencies_seen:
  - SF-12
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
- Write the machine-readable receipt at `receipts/SF-13.yaml`.
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
- [ ] Receipt written to `receipts/SF-13.yaml`.
- [ ] Prompt status changed to `ready-for-review` and file moved from `plans/` to `review/`.

**Execution summary:**  
_Fill only with evidence-backed facts._

**Reviewer attention:**  
_List the highest-risk assumptions, interfaces, and visual/feel judgments the reviewer should challenge._
