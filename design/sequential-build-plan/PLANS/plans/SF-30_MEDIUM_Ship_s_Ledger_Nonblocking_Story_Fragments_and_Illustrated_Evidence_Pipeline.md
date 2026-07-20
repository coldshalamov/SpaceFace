---
id: "SF-30"
sequence: 30
status: "ready"
difficulty: "medium"
discipline: "fullstack"
frontend_difficulty: "hard"
vision_requirement: "yes"
recommended_agent_profile: "Strong narrative systems/frontend agent with image/visual review capability"
depends_on: ["SF-17", "SF-20", "SF-21"]
roadmap_alignment: "A2 Ship\u2019s Ledger, V1/V2, W12\u2013W15, M5 story/coverage"
prompt_system_version: "1.0"
terminal_gate: "ready-for-review with receipt; global completion remains lead-owned"
---

# SF-30 — [MEDIUM][FULLSTACK][FRONTEND-HARD][VISION-YES] Ship’s Ledger, Nonblocking Story Fragments, and Illustrated Evidence Pipeline

<agent_assignment>
  <role>Strong narrative systems/frontend agent with image/visual review capability</role>
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
Physical discoveries and operations produce concise in-flight fragments and persistent, illustrated ledger entries that can be read later without dialogue locks, while image generation follows a reproducible non-cartoon art direction and provenance pipeline.
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
  <prompt_id>SF-30</prompt_id>
  <declared_dependencies>SF-17, SF-20, SF-21</declared_dependencies>
  <roadmap_alignment>A2 Ship’s Ledger, V1/V2, W12–W15, M5 story/coverage</roadmap_alignment>
  <sequence_rule>This prompt is sequential, but the live repository may have advanced. Re-audit all prerequisites. Do not replay an obsolete task merely because its prompt number has arrived.</sequence_rule>
</sequence_position>

<dependency_gate>
  <dependency>SF-17</dependency>
  <dependency>SF-20</dependency>
  <dependency>SF-21</dependency>
  <required_action>Read each dependency receipt and inspect the current code/checks that receipt described. A historical green result does not survive intervening owner changes automatically.</required_action>
  <block_policy>Do not absorb a missing prerequisite into this task. Complete independent audit/test work, then return an exact blocker or shared-change request.</block_policy>
</dependency_gate>




<problem>
Players rarely want to stop and read story before acting. Existing rich lore can be buried in data or modal station interactions, while generated portraits/images tend toward cartoon or 1950s pulp. Story must attach to evidence the player found and remain optional without becoming disposable toast.
</problem>

<consequences_of_the_problem>
If this gap remains, later features will either duplicate weak abstractions, hide failure behind presentation, or make player input less trustworthy. Treat the causal problem above—not merely its visible symptom—as the unit of work.
</consequences_of_the_problem>

<why_this_is_cool_and_worth_building>
The ledger turns the player’s physical history into a durable artifact: black-box frames, engineering cutaways, maps, recovered photos, character dossiers, battle diagrams. It supports deep narrative for readers while keeping flight uninterrupted for everyone else.
</why_this_is_cool_and_worth_building>

<player_observable_checkpoint>
At the end of this prompt, a reviewer must be able to demonstrate this outcome through the declared route:

Physical discoveries and operations produce concise in-flight fragments and persistent, illustrated ledger entries that can be read later without dialogue locks, while image generation follows a reproducible non-cartoon art direction and provenance pipeline.

The checkpoint must be coherent and recoverable. It may leave later breadth for future prompts, but it may not leave the primary result as data-only, debug-only, UI-only, or default-off.
</player_observable_checkpoint>

<scope>
  <mandatory_deliverables>
  <deliverable>Audit current Ship’s Ledger, activity/cause ledger, rumor/flavor producers, contacts/bar/station UI constraints, localization, save, image/asset manifests, and story B0–B7 continuity.</deliverable>
  <deliverable>Define event→story-fragment→ledger-entry contract with stable IDs, provenance, source entity/component/site, discovery conditions, ordering, revisions/unlocks, spoiler/uncertainty state, image slots, accessibility text, and save behavior.</deliverable>
  <deliverable>Implement one- or two-line ambient/inspection fragments that fade automatically, queue/prioritize without spam, and remain recoverable in the ledger.</deliverable>
  <deliverable>Integrate Wreck Cathedral and recomposed sector discoveries into at least 8–12 ledger entries with physical evidence and additive threads.</deliverable>
  <deliverable>Build or refine ledger UI with search/filter/thread/site/provenance, progressive disclosure, keyboard/gamepad/trackpad, text scale, focus, contrast, and no protected station UI regression.</deliverable>
  <deliverable>Define illustrated evidence asset categories and exact image-generation prompt language: cinematic photoreal/industrial documentary/forensic/technical, physically plausible materials/lighting/lenses, no comic/pulp/cartoon/painted cover aesthetic unless intentionally authored.</deliverable>
  <deliverable>Create a reproducible image intake pipeline with prompt/source/provenance, required views/crop, color management, compression, captions/alt text, classification, and runtime admission. Generate or integrate a small representative set only if tools/assets permit.</deliverable>
  <deliverable>Ensure entries update when site state changes rather than duplicating disconnected pages.</deliverable>
  </mandatory_deliverables>
  <explicit_non_goals>
  <non_goal>No dialogue tree, cutscene campaign, or all-story rewrite.</non_goal>
  <non_goal>No hundreds of generated images.</non_goal>
  <non_goal>No mandatory reading gate.</non_goal>
  <non_goal>No redesign of the protected station shell unless the live owner explicitly permits a narrow integration.</non_goal>
  </explicit_non_goals>
</scope>

<mandatory_live_audit>
Before changing code, inspect the live owner paths, imports, registry order, feature flags/defaults, relevant dirty diffs, tests, public routes, save surface, and evidence. Classify each dated premise as `confirmed`, `partially-confirmed`, `obsolete`, `not-reproduced`, or `blocked`.

Use these research anchors as starting points, not brittle file instructions:
  <anchor>Current Ship’s Ledger/activity/contact/rumor/story systems and Wreck Cathedral/site events.</anchor>
  <anchor>Asset classification/admission, UI shell/styles/localization/accessibility, reference story/image pipeline documents.</anchor>

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
  <direction>Story systems emit stable semantic events; ledger owns presentation/indexing, not world truth.</direction>
  <direction>Fragments use priority/cooldown/deduplication and are persisted as discovered evidence.</direction>
  <direction>Images are optional enrichments with text/alt fallback; a missing image cannot block gameplay.</direction>
  <direction>Use art-direction negative controls and gameplay/UI crop validation to suppress pulp/cartoon drift.</direction>
  <direction>Bind image artifacts to hashes/licenses/prompts and normal-route display evidence.</direction>
</implementation_direction>

<acceptance_contract>
  <criterion>Physical actions in Wreck Cathedral/sector produce concise fragments and corresponding ledger entries exactly once.</criterion>
  <criterion>Player can ignore fragments during flight and later find the complete evidence/thread.</criterion>
  <criterion>Ledger survives Continue, updates state coherently, and remains usable/accessibility-compliant.</criterion>
  <criterion>Representative images, if integrated, match declared art direction at UI size and have provenance/alt text; no cartoon fallback is called accepted.</criterion>
  <criterion>No long modal interruption or branching choice deletes major content.</criterion>
  <criterion>Browser/Electron route and UI performance/visual evidence pass.</criterion>
  <status_rule>Do not collapse criteria into “done.” Report the highest state actually reached and the evidence missing for the next state.</status_rule>
</acceptance_contract>

<anti_placeholder_and_failure_mode_contract>
The implementation fails review if any of the following occur:
  <failure>Story only as transient toast.</failure>
  <failure>Long unskippable panels during flight.</failure>
  <failure>Ledger entries created at New Game without evidence.</failure>
  <failure>Cartoon/pulp images accepted because they are technically present.</failure>
  <failure>Image files without provenance, classification, alt text, or runtime crop review.</failure>
  <failure>Duplicate entries for each state update.</failure>
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
  <verification>Event/dedupe/order/save/thread/state-update tests and localization/accessibility.</verification>
  <verification>Public discovery→fragment→ledger route in browser/Electron.</verification>
  <verification>Vision review of ledger hierarchy and image art direction at actual display sizes.</verification>
  <verification>UI/perf/memory/asset admission checks.</verification>
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

Write this receipt shape to `receipts/SF-30.yaml`:

```yaml
packet: SF-30
prompt_file: <current filename>
agent: <agent or task id>
base_commit: <sha>
result_commit: <sha-or-uncommitted>
worktree: <absolute path>
state_reached: <ALREADY_SATISFIED|IMPLEMENTED|FOCUSED_GREEN|ROUTE_ACCEPTED|VISUALLY_ACCEPTED|BLOCKED>
dependencies_seen:
  - SF-17
  - SF-20
  - SF-21
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
- Write the machine-readable receipt at `receipts/SF-30.yaml`.
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
- [ ] Receipt written to `receipts/SF-30.yaml`.
- [ ] Prompt status changed to `ready-for-review` and file moved from `plans/` to `review/`.

**Execution summary:**  
_Fill only with evidence-backed facts._

**Reviewer attention:**  
_List the highest-risk assumptions, interfaces, and visual/feel judgments the reviewer should challenge._
