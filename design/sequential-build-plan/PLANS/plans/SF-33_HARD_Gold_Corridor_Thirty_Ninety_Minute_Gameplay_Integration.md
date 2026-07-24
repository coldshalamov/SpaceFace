---
id: "SF-33"
sequence: 33
status: "ready"
difficulty: "hard"
discipline: "program"
frontend_difficulty: "medium"
vision_requirement: "yes"
recommended_agent_profile: "Top-tier integration/playtest agent with browser/Electron and vision capability"
depends_on: ["SF-10", "SF-15", "SF-21", "SF-23", "SF-25", "SF-30", "SF-32"]
roadmap_alignment: "G01\u2013G20, T18, A20, W07\u2013W18; first-hour acceptance"
prompt_system_version: "1.0"
terminal_gate: "ready-for-review with receipt; global completion remains lead-owned"
---

# SF-33 — [HARD][PROGRAM][FRONTEND-MEDIUM][VISION-YES] Gold-Corridor Thirty/Ninety-Minute Gameplay Integration

<agent_assignment>
  <role>Top-tier integration/playtest agent with browser/Electron and vision capability</role>
  <recommended_routing>A vision-capable frontend/3D/game-feel agent is required for final player-facing acceptance. A backend/no-vision agent may help with pure kernels, but must not self-sign visual quality.</recommended_routing>
  <operating_mode>Autonomous bounded implementation. Audit, implement, verify, and return the receipt in this run; do not stop at planning.</operating_mode>
<pseudo_skills>
  <skill name="live-repository-truth-reconciliation">Reconcile git identity, current checks, public routes, ledgers, and stale plan claims without importing historical completion.</skill>
  <skill name="shared-tree-integration-safety">Preserve concurrent work, reason about path and semantic mutexes, and produce recoverable receipts.</skill>
  <skill name="acceptance-architecture">Distinguish implementation, focused proof, player-route proof, visual proof, and integration.</skill>
</pseudo_skills>
</agent_assignment>

<mission>
All three career starts can complete a coherent thirty-minute corridor and at least representative ninety-minute routes containing travel, trade, mining, Massline, physics combat, world activity, loss/recovery, first upgrade/infrastructure progress, story discovery, save/Continue, and readable presentation.
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
  <prompt_id>SF-33</prompt_id>
  <declared_dependencies>SF-10, SF-15, SF-21, SF-23, SF-25, SF-30, SF-32</declared_dependencies>
  <roadmap_alignment>G01–G20, T18, A20, W07–W18; first-hour acceptance</roadmap_alignment>
  <sequence_rule>This prompt is sequential, but the live repository may have advanced. Re-audit all prerequisites. Do not replay an obsolete task merely because its prompt number has arrived.</sequence_rule>
</sequence_position>

<dependency_gate>
  <dependency>SF-10</dependency>
  <dependency>SF-15</dependency>
  <dependency>SF-21</dependency>
  <dependency>SF-23</dependency>
  <dependency>SF-25</dependency>
  <dependency>SF-30</dependency>
  <dependency>SF-32</dependency>
  <required_action>Read each dependency receipt and inspect the current code/checks that receipt described. A historical green result does not survive intervening owner changes automatically.</required_action>
  <block_policy>Do not absorb a missing prerequisite into this task. Complete independent audit/test work, then return an exact blocker or shared-change request.</block_policy>
</dependency_gate>




<problem>
A repository can contain dozens of individually green systems that never compose into a game. Existing gold-corridor and deep-state tooling is valuable, but feature churn can leave routes stale, rewards duplicated, controls undiscoverable, content unreachable, or the first hour boring despite passing unit checks.
</problem>

<consequences_of_the_problem>
If this gap remains, later features will either duplicate weak abstractions, hide failure behind presentation, or make player input less trustworthy. Treat the causal problem above—not merely its visible symptom—as the unit of work.
</consequences_of_the_problem>

<why_this_is_cool_and_worth_building>
This is where the refactor cashes out. The player should leave the first session understanding what SpaceFace is: move through a real universe, manipulate motion, exploit opportunities, survive consequences, and begin building something that changes the world.
</why_this_is_cool_and_worth_building>

<player_observable_checkpoint>
At the end of this prompt, a reviewer must be able to demonstrate this outcome through the declared route:

All three career starts can complete a coherent thirty-minute corridor and at least representative ninety-minute routes containing travel, trade, mining, Massline, physics combat, world activity, loss/recovery, first upgrade/infrastructure progress, story discovery, save/Continue, and readable presentation.

The checkpoint must be coherent and recoverable. It may leave later breadth for future prompts, but it may not leave the primary result as data-only, debug-only, UI-only, or default-off.
</player_observable_checkpoint>

<scope>
  <mandatory_deliverables>
  <deliverable>Re-audit the current gold-corridor route, deep-state ladder, career origins, first-station/trade/mining/combat/recovery/upgrade/save milestones, Atlas travel, and all new feature producers.</deliverable>
  <deliverable>Define a player-observable thirty-minute journey for each career with common core and meaningful variation; define representative ninety-minute continuation goals.</deliverable>
  <deliverable>Integrate existing missions/tutorialization through action and environment, not modal instruction walls.</deliverable>
  <deliverable>Ensure at least one Massline acquisition/orbit/release, one physics-weapon combination, one visible NPC job loop, one sector postcard traversal, one Asteroid Ops survey/operation, one loss/recovery path, one ledger discovery, and one industrial/progression consequence are naturally reachable.</deliverable>
  <deliverable>Calibrate enemies, rewards, travel times, mission terms, cargo capacity, resource costs, heat/attention, and first upgrades using cohort runs and observed blockers—not arbitrary global buffs.</deliverable>
  <deliverable>Repair route/harness drift where proven; preserve public-input, no-injection acceptance.</deliverable>
  <deliverable>Capture stable deep-state fixtures at meaningful turning points with current schema/hashes and Continue proof.</deliverable>
  <deliverable>Run all three careers under held-out seeds/policies, browser and Electron, with clean teardown, performance/memory, accessibility, and current media.</deliverable>
  <deliverable>Produce an integration report separating feature defects, content/balance blockers, harness defects, and unproven subjective quality.</deliverable>
  </mandatory_deliverables>
  <explicit_non_goals>
  <non_goal>No new broad feature family.</non_goal>
  <non_goal>No hiding gaps with injected state, compressed timers, free rewards, or invulnerable player.</non_goal>
  <non_goal>No ninety-minute scripted bot that cannot represent human input/understanding.</non_goal>
  <non_goal>No release-store polish yet.</non_goal>
  </explicit_non_goals>
</scope>

<mandatory_live_audit>
Before changing code, inspect the live owner paths, imports, registry order, feature flags/defaults, relevant dirty diffs, tests, public routes, save surface, and evidence. Classify each dated premise as `confirmed`, `partially-confirmed`, `obsolete`, `not-reproduced`, or `blocked`.

Use these research anchors as starting points, not brittle file instructions:
  <anchor>Roadmap G01–G20, current public pilot/deep-state fixtures, career origins and corridor missions.</anchor>
  <anchor>All prior feature receipts and current route producers, Atlas/map/travel/save/perf/evidence systems.</anchor>

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
  <direction>Use current public pilot abstractions and semantic milestones, not guessed selectors/fixed sleeps.</direction>
  <direction>Treat route blockers as evidence and fix the owning seam in bounded commits/diffs.</direction>
  <direction>Use held-out seeds/careers after tuning; avoid overfitting the known route.</direction>
  <direction>Measure time-to-understand/action, dead travel, retries, damage/recovery, earnings/spend, feature usage, and save/Continue.</direction>
  <direction>Use current visual captures and human/vision review in addition to automation.</direction>
</implementation_direction>

<acceptance_contract>
  <criterion>Each career completes a thirty-minute public route with coherent earnings, controls, objectives, and at least the declared signature experiences.</criterion>
  <criterion>Representative ninety-minute runs reach upgrade/industry/world transformation progress and recover from at least one failure.</criterion>
  <criterion>No duplicated reward, stale objective, orphan route, missing action, or save/Continue divergence.</criterion>
  <criterion>Browser and Electron outcomes agree and tear down cleanly.</criterion>
  <criterion>Performance/memory remain bounded at ordinary and crowded moments.</criterion>
  <criterion>First-hour captures and review show distinct world/physics identity, not a collection of menus and clusters.</criterion>
  <status_rule>Do not collapse criteria into “done.” Report the highest state actually reached and the evidence missing for the next state.</status_rule>
</acceptance_contract>

<anti_placeholder_and_failure_mode_contract>
The implementation fails review if any of the following occur:
  <failure>Injected state as primary route.</failure>
  <failure>Skipping travel/mining/combat through debug flags.</failure>
  <failure>Balancing only one career/seed.</failure>
  <failure>Calling route completion fun without observation/evidence.</failure>
  <failure>Adding tutorial text instead of fixing affordance/control.</failure>
  <failure>Re-recording goldens to hide regressions.</failure>
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
  <verification>Gold-corridor/deep-state/career/mission/economy/massline/asteroid/story/save checks.</verification>
  <verification>Three career thirty-minute receipts and held-out ninety-minute representative receipts in browser/Electron.</verification>
  <verification>Accessibility, visual, performance, memory, teardown, and regression matrix.</verification>
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

Write this receipt shape to `receipts/SF-33.yaml`:

```yaml
packet: SF-33
prompt_file: <current filename>
agent: <agent or task id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
worktree: <absolute path>
state_reached: <ALREADY_SATISFIED|IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|VISUALLY_ACCEPTED|BLOCKED>
dependencies_seen:
  - SF-10
  - SF-15
  - SF-21
  - SF-23
  - SF-25
  - SF-30
  - SF-32
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
- Write the machine-readable receipt at `receipts/SF-33.yaml`.
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
- [ ] Receipt written to `receipts/SF-33.yaml`.
- [ ] Prompt status changed to `ready-for-review` and file moved from `plans/` to `review/`.

**Execution summary:**  
_Fill only with evidence-backed facts._

**Reviewer attention:**  
_List the highest-risk assumptions, interfaces, and visual/feel judgments the reviewer should challenge._
