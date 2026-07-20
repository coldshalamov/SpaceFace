---
id: "SF-14"
sequence: 14
status: "ready"
difficulty: "hard"
discipline: "fullstack"
frontend_difficulty: "hard"
vision_requirement: "yes"
recommended_agent_profile: "Top-tier full-stack game agent plus strong frontend/vision capability"
depends_on: ["SF-06", "SF-08", "SF-12", "SF-13"]
roadmap_alignment: "Planet states W1/W2, world postcard, gravity course, combat/environment identity"
prompt_system_version: "1.0"
terminal_gate: "ready-for-review with receipt; global completion remains lead-owned"
---

# SF-14 — [HARD][FULLSTACK][FRONTEND-HARD][VISION-YES] Planetary Sling, Atmospheric Skim, and Enemy Reentry Vertical Slice

<agent_assignment>
  <role>Top-tier full-stack game agent plus strong frontend/vision capability</role>
  <recommended_routing>A vision-capable frontend/3D/game-feel agent is required for final player-facing acceptance. A backend/no-vision agent may help with pure kernels, but must not self-sign visual quality.</recommended_routing>
  <operating_mode>Autonomous bounded implementation. Audit, implement, verify, and return the receipt in this run; do not stop at planning.</operating_mode>
<pseudo_skills>
  <skill name="vertical-slice-integration">Connect deterministic kernels, runtime adapters, UI, persistence, presentation, and route evidence in one coherent slice.</skill>
  <skill name="single-writer-contracts">Reuse authoritative owners and return integration requests rather than creating shadow state.</skill>
  <skill name="save-and-recovery-design">Make old saves safe, state transitions idempotent, and failure/recovery explicit.</skill>
  <skill name="cross-platform-acceptance">Preserve browser/Electron parity, accessibility, performance, and clean teardown.</skill>
</pseudo_skills>
</agent_assignment>

<mission>
One visually colossal planet supports a Massline/field-assisted sling route, an atmosphere-skimming resource activity, and a deliberate enemy reentry kill—three mechanics sharing geometry, targeting, fields, prediction, and presentation.
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
  <prompt_id>SF-14</prompt_id>
  <declared_dependencies>SF-06, SF-08, SF-12, SF-13</declared_dependencies>
  <roadmap_alignment>Planet states W1/W2, world postcard, gravity course, combat/environment identity</roadmap_alignment>
  <sequence_rule>This prompt is sequential, but the live repository may have advanced. Re-audit all prerequisites. Do not replay an obsolete task merely because its prompt number has arrived.</sequence_rule>
</sequence_position>

<dependency_gate>
  <dependency>SF-06</dependency>
  <dependency>SF-08</dependency>
  <dependency>SF-12</dependency>
  <dependency>SF-13</dependency>
  <required_action>Read each dependency receipt and inspect the current code/checks that receipt described. A historical green result does not survive intervening owner changes automatically.</required_action>
  <block_policy>Do not absorb a missing prerequisite into this task. Complete independent audit/test work, then return an exact blocker or shared-change request.</block_policy>
</dependency_gate>




<problem>
Planets currently risk being background balls or damage circles. Realistic atmospheres/orbits can consume enormous effort without yielding fun. The product needs one restrained planetary place that proves planets create movement, harvesting, combat, traffic, and character through reusable primitives.
</problem>

<consequences_of_the_problem>
If this gap remains, later features will either duplicate weak abstractions, hide failure behind presentation, or make player input less trustworthy. Treat the causal problem above—not merely its visible symptom—as the unit of work.
</consequences_of_the_problem>

<why_this_is_cool_and_worth_building>
This slice can become the game’s signature trailer moment: dive toward a giant world, latch or ride the band, skim a glowing atmosphere while harvesting, release at the green window, and throw a disabled pursuer into a plasma death. One place, many verbs.
</why_this_is_cool_and_worth_building>

<player_observable_checkpoint>
At the end of this prompt, a reviewer must be able to demonstrate this outcome through the declared route:

One visually colossal planet supports a Massline/field-assisted sling route, an atmosphere-skimming resource activity, and a deliberate enemy reentry kill—three mechanics sharing geometry, targeting, fields, prediction, and presentation.

The checkpoint must be coherent and recoverable. It may leave later breadth for future prompts, but it may not leave the primary result as data-only, debug-only, UI-only, or default-off.
</player_observable_checkpoint>

<scope>
  <mandatory_deliverables>
  <deliverable>Choose/register one planet with authoritative global position, colossal game-camera silhouette, stable transform, collision/exclusion policy, field profile, atmosphere bands, route anchors, and map/Atlas identity.</deliverable>
  <deliverable>Implement a bounded planetary attraction or authored sling assistance using SF-12 field kernel and/or massive-anchor Massline policy; explicitly document artistic liberties.</deliverable>
  <deliverable>Create influence/sling/useful/high-risk/atmosphere regions with readable world-space bands and no arbitrary invisible damage circle.</deliverable>
  <deliverable>Integrate SF-03 target selection, SF-05 orbit assist, SF-06 release predictor/course validator, camera speed language, and earned momentum.</deliverable>
  <deliverable>Implement atmospheric skimming: deploy/drag a collector or use an explicit harvesting device; yield depends on distance traversed and density while heat/drag/risk rises deeper.</deliverable>
  <deliverable>Implement enemy reentry state: eligibility from inward trajectory, control disruption/tumble/health, escape capability, plasma onset, debris shedding, breakup, and receipt. Healthy enemies retain counterplay.</deliverable>
  <deliverable>Give player asymmetric emergency recovery that costs energy/heat/momentum rather than casual instant death.</deliverable>
  <deliverable>Add one small traffic/activity context and normal route to the location; preserve Atlas/travel integration.</deliverable>
  <deliverable>Produce professional planet/atmosphere/plasma/trajectory VFX with LOD, pooling, black-space contrast, reduced settings, and browser/Electron evidence.</deliverable>
  </mandatory_deliverables>
  <explicit_non_goals>
  <non_goal>No landable surface, full orbital mechanics, multiple planets, or N-body simulation.</non_goal>
  <non_goal>No fully realistic atmospheric fluid simulation.</non_goal>
  <non_goal>No planet-scale texture/asset project that blocks gameplay; use the established authored/procedural hybrid pipeline.</non_goal>
  <non_goal>No instant atmosphere kill for any enemy crossing a radius.</non_goal>
  </explicit_non_goals>
</scope>

<mandatory_live_audit>
Before changing code, inspect the live owner paths, imports, registry order, feature flags/defaults, relevant dirty diffs, tests, public routes, save surface, and evidence. Classify each dated premise as `confirmed`, `partially-confirmed`, `obsolete`, `not-reproduced`, or `blocked`.

Use these research anchors as starting points, not brittle file instructions:
  <anchor>Place registration/Atlas/world coordinates, SF-06 course/presentation, SF-12 field kernel, SF-13 statuses.</anchor>
  <anchor>Cargo/mining/heat/AI/destruction/VFX/camera/save owners and planet-state groundwork.</anchor>

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
  <direction>Treat region transitions with hysteresis and publish semantic state: outside, influence, sling, skim, danger, reentry.</direction>
  <direction>Atmospheric density may use an exponential or authored falloff; heating should scale sharply enough to create an optimal band.</direction>
  <direction>Use continuous forces/drag through authority and explicit collector state/yield receipts through cargo/economy owners.</direction>
  <direction>Reentry presentation follows actual velocity/leading edge and progresses over time.</direction>
  <direction>Validate course robustness and camera framing at multiple approach speeds.</direction>
</implementation_direction>

<acceptance_contract>
  <criterion>Planet reads as a major spatial body before interaction range and remains aligned with field/bands/collision.</criterion>
  <criterion>Player can intentionally enter, maintain, and exit a sling/skim route with readable prediction and risk.</criterion>
  <criterion>Harvest yield comes from actual skim path/density and settles through cargo ownership; no hold-E global timer.</criterion>
  <criterion>A disabled/tumbled/marked enemy can be driven into reentry, shows staged plasma/breakup, and produces lawful gameplay consequences.</criterion>
  <criterion>A healthy enemy can often escape a marginal pass.</criterion>
  <criterion>Player emergency recovery works, costs something meaningful, and does not teleport invisibly.</criterion>
  <criterion>Browser/Electron, save/Continue, performance, accessibility, and Atlas route evidence pass.</criterion>
  <status_rule>Do not collapse criteria into “done.” Report the highest state actually reached and the evidence missing for the next state.</status_rule>
</acceptance_contract>

<anti_placeholder_and_failure_mode_contract>
The implementation fails review if any of the following occur:
  <failure>Decorative planet around tiny collider.</failure>
  <failure>Atmosphere as one damage circle or resource button.</failure>
  <failure>Fake orbit/path animation.</failure>
  <failure>Speed buff for entering a ring.</failure>
  <failure>Enemy instant deletion at boundary.</failure>
  <failure>Full-screen bloom/fog hiding weak geometry.</failure>
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
  <verification>Field/band/reentry state tests, collector yield/heat/drag, predictor differential, course robustness, AI escape.</verification>
  <verification>Save/Continue and route/map/place integrity.</verification>
  <verification>Normal browser/Electron motion captures reviewed by vision agent, including reduced settings.</verification>
  <verification>Profile field/entity/VFX cost and clean teardown.</verification>
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

Write this receipt shape to `receipts/SF-14.yaml`:

```yaml
packet: SF-14
prompt_file: <current filename>
agent: <agent or task id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
worktree: <absolute path>
state_reached: <ALREADY_SATISFIED|IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|VISUALLY_ACCEPTED|BLOCKED>
dependencies_seen:
  - SF-06
  - SF-08
  - SF-12
  - SF-13
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
- Write the machine-readable receipt at `receipts/SF-14.yaml`.
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
- [ ] Receipt written to `receipts/SF-14.yaml`.
- [ ] Prompt status changed to `ready-for-review` and file moved from `plans/` to `review/`.

**Execution summary:**  
_Fill only with evidence-backed facts._

**Reviewer attention:**  
_List the highest-risk assumptions, interfaces, and visual/feel judgments the reviewer should challenge._
