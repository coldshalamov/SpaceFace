<!-- LIFETIME: STABLE -->
# SpaceFace Canonical Build Map

This is the repository's implementation front door. It is intentionally a **router**, not a status ledger or historical transcript. The pre-Central-Brain long-form map is preserved for archaeology at [`design/program/historical/CANONICAL_BUILD_MAP_PRE_CENTRAL_BRAIN.md`](./design/program/historical/CANONICAL_BUILD_MAP_PRE_CENTRAL_BRAIN.md); it has no current dispatch authority.

## 1. Start here

Before changing anything:

1. Run `git status --short` and inspect the current branch/HEAD. Do not create a worktree by default.
2. Read root [`AGENTS.md`](./AGENTS.md).
3. Read only the relevant sections of [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`design/VISION.md`](./design/VISION.md), and [`design/GDD_2_0.md`](./design/GDD_2_0.md).
4. Read the short shared-edit board [`design/program/NOW.md`](./design/program/NOW.md).
5. Decide which door the user actually opened:
   - **Exact PQ / exact bug / exact file / exact outcome:** use `node scripts/program-dispatch.mjs --id PQ-XXX` and the named active packet. Exact user scope outranks global ranking.
   - **NEXT / develop the game / make it professional / broad unnamed work:** read [`design/program/CENTRAL_BRAIN.md`](./design/program/CENTRAL_BRAIN.md), then run `python tools/agentic/select_next_work.py --format prompt`.
   - **Campaign / overnight / do all of it:** run `python tools/agentic/manager_cycle.py --refresh --limit 3`; execute one bounded dependency-front unit, integrate/prove it, then refresh the ranking before the next unit.
   - **Explicit INFERENCE:** use [`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md) plus [`design/program/INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md).
   - **Jules / cloud-agent batch:** use [`design/program/jules/README.md`](./design/program/jules/README.md); Jules is a candidate bank, never the live PQ queue or acceptance authority.
6. `design/program/roadmap/program-queue.json` remains the only admitted machine index. `node scripts/program-dispatch.mjs --ready` remains its canonical dependency-ready read view. The Central Brain ranks existing dependency-ready work; it does **not** create a second queue or acceptance vocabulary.
7. Open the returned packet in [`design/program/roadmap/active/`](./design/program/roadmap/active/README.md). If an already-admitted unit lacks an executable packet, shape the smallest packet from [`PACKET_TEMPLATE.md`](./design/program/roadmap/active/PACKET_TEMPLATE.md) rather than inventing a new outcome.
8. Use [`docs/MODULE_MAP.md`](./docs/MODULE_MAP.md), [`docs/SYSTEM_REGISTRY.md`](./docs/SYSTEM_REGISTRY.md), and [`docs/EVENT_ROUTING.md`](./docs/EVENT_ROUTING.md) to locate live owners. Search the owning seams and their tests before broad repository archaeology.
9. Follow [`design/program/roadmap/00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md) through a terminal receipt.
10. Add one short `NOW.md` row only when mutation begins. Reading, research, tests and review do not reserve files. Release the row when mutation stops.
11. **Single task:** finish the bounded unit, commit/push, report `DONE` or `NOT DONE`, then stop. **Campaign:** keep going, but re-rank after every integrated unit instead of locking the whole session to the first family selected.

### 1.1 Broad development is quality-ranked, not graphics-default

The old front door treated unnamed `--next` / overnight work as a fleet-remaster campaign. That routing is retired.

For broad work, the Central Brain ranks demonstrated player-facing debt across integrity, controls/flight, combat/AI, performance/lifecycle, presentation/VFX, visual coherence, UI/strategic surfaces, content breadth and cross-system parity. An actionable core RED normally outranks optional premium micro-detail. An explicit user request always overrides the portfolio heuristic.

`PQ-050` remains a valid explicit graphics campaign. Run it when the user asks for it or when current quality evidence ranks its next leaf above the alternatives. Do not privilege it merely because it contains many unfinished ships.

### 1.2 Central Brain deep architecture

The compact operator law is [`design/program/CENTRAL_BRAIN.md`](./design/program/CENTRAL_BRAIN.md). The recovered full architecture lives under [`docs/agentic-development/`](./docs/agentic-development/AGENTIC_GAME_DEVELOPMENT_OS.md):

- [`AGENTIC_GAME_DEVELOPMENT_OS.md`](./docs/agentic-development/AGENTIC_GAME_DEVELOPMENT_OS.md) — authority, roles, dispatch, anti-recursion, Jules/INFERENCE integration.
- [`OBSERVABILITY_REPLAY_AND_PLAYTEST_ARCHITECTURE.md`](./docs/agentic-development/OBSERVABILITY_REPLAY_AND_PLAYTEST_ARCHITECTURE.md) — exact observer hooks, matched replay, autonomous playtesting.
- [`QUALITY_SCORECARD.md`](./docs/agentic-development/QUALITY_SCORECARD.md) — BLOCKED/RED/YELLOW/GREEN/UNKNOWN, evidence freshness and L0–L3 maturity.
- [`PLAN_CONVERGENCE_PROTOCOL.md`](./docs/agentic-development/PLAN_CONVERGENCE_PROTOCOL.md) — deduplicate plans without creating another backlog.
- [`CONTENT_FACTORY_AND_COMPLETENESS.md`](./docs/agentic-development/CONTENT_FACTORY_AND_COMPLETENESS.md) — combinatorial breadth with role/counterplay coverage.
- [`INFERENCE_PROTOCOL.md`](./docs/agentic-development/INFERENCE_PROTOCOL.md) — bounded divergence → selection → production → termination.
- [`VISUAL_DIRECTION_AND_VFX_SYSTEM.md`](./docs/agentic-development/VISUAL_DIRECTION_AND_VFX_SYSTEM.md) — luminous arcade aerospace, maturity parity and causal VFX.
- [`PERFORMANCE_GOVERNANCE.md`](./docs/agentic-development/PERFORMANCE_GOVERNANCE.md) — same-picture, evidence-first optimization.
- [`IMPLEMENTATION_ROADMAP.md`](./docs/agentic-development/IMPLEMENTATION_ROADMAP.md) — staged wiring from routing through autonomous play/content scale-out.

The manager loop is:

```text
observe -> reduce -> rank -> assign -> implement -> replay -> compare -> keep/revert -> refresh
```

LLMs explore and diagnose. Deterministic scenarios/replays remember and regress.

### 1.3 Special explicit doors

These remain direct because the user has named the problem family:

- **Hitching / stutter / frame liveness:** use [`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md) and `node scripts/program-dispatch.mjs --id PQ-129`.
- **Non-Hitch flyable-ship remaster:** use `node scripts/program-dispatch.mjs --id PQ-050`, [`docs/visual-assets/README.md`](./docs/visual-assets/README.md), and [`design/program/GRAPHICS_ITERATION_LOOP.md`](./design/program/GRAPHICS_ITERATION_LOOP.md). Fixed pass/reviewer counts are not universal gates; continue for named shipping-camera defects.
- **3D world-object remaster:** use [`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md).
- **Asteroid Works playfield:** use [`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md) and `node scripts/program-dispatch.mjs --id PQ-130`.
- **Asteroid Works authored objects:** use [`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md) and `node scripts/program-dispatch.mjs --id PQ-131`.
- **2D/HUD/menu/screen work:** read [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) before design or implementation.
- **Crucible / Survival / Combat Lab / attack modifiers / arenas:** use [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md) and exact admitted PQ-133 work where applicable.
- **Arcade structural VFX:** use the existing PQ-134 causal grammar and live `src/render/combat/arcadeStructuralFx.js`; do not invent a parallel decorative VFX architecture.
- **Flight/movement regression:** use the existing Motion Lab/PQ-135 work as characterization evidence. A historical `DONE` marker does not prevent a new demonstrated regression from becoming new work.
- **Unused/authored asset fielding:** use current reachability/catalog evidence and the reuse-first law from PQ-136 rather than a filename grep.
- **Orphan work recovery:** use [`design/program/WORKTREE_RECOVERY.md`](./design/program/WORKTREE_RECOVERY.md) or the explicit orphan-harvest campaign when that is the user's task.

## 2. Product north star

SpaceFace is a systemic space game whose distinctive play is physical: gravity, inertia, collision, Massline attachment, boost, payload mass, fields, recoil, orbital geometry and improvised physical tricks should create tactics that are visible, learnable and surprising.

A strong implementation:

- creates a meaningful player decision rather than another disconnected data row;
- lets existing systems interact instead of scripting decorative imitations;
- keeps cause and consequence legible at the normal game camera;
- preserves deterministic simulation, single-writer ownership, save/Continue and Browser/Electron parity;
- treats ambitious graphics/VFX/UI as game design, not optional garnish;
- pays for spectacle through structural performance work, not silent default-quality cuts;
- leaves one coherent game path rather than a probe-only or mode-specific fork.

When a plan and current evidence disagree, preserve the intended player outcome and repair the execution path. Do not preserve a stale technique or process quota merely because old prose named it.

## 3. Authority and truth

The plan-family index is [`design/PLAN_REGISTRY.md`](./design/PLAN_REGISTRY.md).

Use this order when sources disagree:

1. the user's current direction;
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) for technical invariants;
3. [`design/VISION.md`](./design/VISION.md) for product emphasis;
4. [`design/GDD_2_0.md`](./design/GDD_2_0.md) for game design intent;
5. admitted program work and current active packet;
6. live code/current checks/player-route evidence for implementation truth;
7. supporting methods/experiment banks;
8. historical handoffs/receipts for archaeology.

A lower source cannot impose a permanent palette, geometry ceiling, process quota, ownership lane or gameplay prohibition that contradicts a higher source.

## 4. Control surfaces

| Surface | Owns | Must not own |
|---|---|---|
| `design/program/NOW.md` | exact paths currently being mutated | backlog, history, subsystem ownership |
| `program-queue.json` + `program-dispatch` | admitted identities, dependency order, coarse lifecycle | quality ranking, active dirty hunks |
| active packet | bounded outcome, owner seams, write/proof budget | unrelated global backlog |
| receipts/acceptance pages | exact-revision evidence | future priority |
| Central Brain | advisory quality ranking and campaign allocation | queue mutation, product authority, acceptance |
| generated module/event/system maps | navigation | product priority |

Lifecycle and acceptance remain separate. Integrated code may still lack route acceptance; a later regression may create new quality debt without making an old truthful receipt false.

## 5. Selecting and shaping work

For exact work, take the named dependency-front unit or the exact unit the user assigned.

For broad work, the Central Brain chooses among dependency-ready units using demonstrated player exposure, severity, recurrence, evidence confidence, leverage and coarse cost. Unknown severe-looking areas may first receive a cheap characterization rather than speculative implementation.

An executable packet should name:

- one player outcome and ordinary route;
- current owner modules/events/APIs;
- dependencies and exact/bounded write surfaces;
- non-goals;
- deterministic/save/single-writer invariants;
- graphics/accessibility semantics where relevant;
- cost model for per-frame/entities/assets/DOM/save growth;
- one agent-observable temporal scenario for behavior that unfolds over time;
- focused proof and stop conditions.

If the outcome spans several independently releasable player results, split it.

## 6. Implementation posture

Reuse owners and narrow seams. Characterize before mutation. Prefer a seconds-scale deterministic regression before a broad headed debug loop.

For physics-heavy work ask:

1. What state is authoritative?
2. Which current systems can couple to it?
3. What counterplay/failure keeps it from becoming a button that wins?
4. What cue makes force, risk and ownership legible?

For visual work, prove the normal shipping camera first. Placeholder clay is diagnostic only. Premium microdetail does not outrank a common invisible/fallback/partial asset.

For feel/performance work, change one causal hypothesis at a time. After two failed repair cycles under the same causal model, record it falsified and change the model instead of looping.

## 7. Verification that converges

Use [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md) and the finite state machine in [`design/program/roadmap/00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md).

Essential rules:

- focused deterministic checks precede expensive live probes;
- every temporal gameplay claim names a repeatable scenario/tape or explains the missing observability seam;
- before/after comparison preserves the same seed/input policy when applicable;
- never rerun an unchanged failure fingerprint;
- support tooling does not substitute for the requested player outcome;
- subjective visual review uses the shipping camera and normally one cold reviewer;
- fixed review/pass counts are not universal acceptance law;
- checks must be negative-tested: a check never seen fail has not proved it can detect its target;
- unrelated findings become ranked follow-ups, not reasons to keep the current packet open forever.

The existing validation broker remains the owner for expensive Browser/Electron acceptance where applicable.

## 8. Performance is part of design

Use [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md) and [`docs/agentic-development/PERFORMANCE_GOVERNANCE.md`](./docs/agentic-development/PERFORMANCE_GOVERNANCE.md).

Performance candidates preserve the same authored picture/content unless the product change itself intentionally changes content. Measure p50/p95/p99 and hitch events; name first-use compile/upload/admission costs; expose instrumentation blind spots.

Do not pass by lowering default render scale, effects, shadows, particles, authored detail, population or content density.

### 8.1 Structural performance families

Investigate measured poles in bounded families: visibility/submission, first-use admission, simulation/AI cadence, scene-graph/CPU prep, post/present, resource lifetime, and conditional platform/backend work.

The exhaustive option space remains [`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md). Its existence does not make every technique active work.

### 8.2 Large-platform trigger

Worker/WASM/WebGPU/native work requires a reproducible representative bottleneck, evidence that smaller structural fixes are insufficient, a narrow same-contract slice, rollback strategy and a measured gain that justifies complexity.

### 8.3 Performance evidence

A useful performance receipt states scenario/seed/profile, baseline/candidate, same-picture claim, frame distribution, hitch owners, relevant resource deltas, determinism/parity and known instrument limits.

### 8.4 Hitch campaign (`PQ-129`)

If the user explicitly reports hitching/stutter/frozen presentation, use the admitted hitch campaign and current packet via `node scripts/program-dispatch.mjs --id PQ-129`. Re-measure the actual current pole before reviving an old optimization hypothesis; the campaign history contains multiple disproven guesses and no-op optimizations.

Use `src/core/runtimeWitness.js` as the cheap liveness/performance tripwire and the observatory for richer synchronized evidence as it is wired.

## 9. Documentation and instruction hygiene

Durable routing documents describe authority and process, not live branch/task snapshots. Volatile status belongs in its declared volatile surface. Historical material can explain decisions but cannot silently reactivate work.

Before acting on a large old plan's claim that something is absent, re-check the current owner/code/queue. The repo has repeatedly outgrown its prose snapshots.

Run `node scripts/check-program-docs.mjs` after changing program control surfaces. Run `python tools/agentic/validate_control_plane.py` for Central Brain routing/integrity.

## 10. Checkoff and receipts

The finishing agent updates the selected unit's normal packet/receipt/queue truth after proving the exact candidate. The Central Brain does not own a second completion state.

A receipt should state what changed, what passed, what route/scenario was observed, what remains unproven, relevant performance evidence, and deliberately excluded follow-ups. "Tests pass" and a single screenshot are not substitutes for those facts.

## 11. Frontend and strategic layer

The frontend is gameplay: it is where the player understands the simulation, world, ship and choices. Every 2D/HUD/menu surface starts with [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md).

Use existing frontend infrastructure rather than designing another UI system:

- screen-specific designs under `design/frontend/`;
- shared state/memory/data-state primitives;
- normal, reduced-motion, forced-colors and pseudo-localized capture states;
- supported 1280×720 / 1920×1080 / ultrawide behavior;
- visual regression tooling;
- existing strategic instruments and entity-link/resolver model.

The Central Brain reviews current route parity and regressions. It does not restart already-landed frontend phases because an old status table says they were missing.

## 12. Crucible, Survival and Combat Lab (`PQ-133` family)

Crucible's durable master plan is [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md). It is also a powerful test surface: Combat Lab can launch real combat owners under controlled hull/loadout/enemy/seed/arena conditions.

Use Combat Lab as the interactive combat/AI agent-playtest foundation. Do not fork a separate agent-only combat implementation.

Attack/content expansion should reuse the established attack algebra, causal lineage, proc budgets, wave planning/spawn budgets and content validators. New content must remain Adventure-compatible through the same owners.

## 13. Visual, VFX, flight and content convergence

### 13.1 Arcade VFX (`PQ-134` foundation)

Reuse the structural pooled blades/arcs/shards and causal grammar for direct, bank, chain, collision, terrain, tether, field and reaction effects. New effects define shape/timing/motion/color/priority/audio/saturation behavior. Decorative soft cards/rings are not the default explanation for a physical cause.

### 13.2 Visual direction

Use [`docs/agentic-development/VISUAL_DIRECTION_AND_VFX_SYSTEM.md`](./docs/agentic-development/VISUAL_DIRECTION_AND_VFX_SYSTEM.md): luminous arcade aerospace, physically coherent authored materials where they read, strong silhouette/negative space, causal bright energy, controlled L0–L3 maturity.

### 13.3 Flight and movement (`PQ-135` foundation)

Reuse the Motion Lab scenarios and telemetry for acceleration/brake/slalom/reversal/path following/formation/cohort regressions. A previous implementation marked `DONE` is baseline history, not proof that future code cannot regress feel.

### 13.4 Content breadth (`PQ-133.12` / reuse-first `PQ-136` lessons)

Use [`docs/agentic-development/CONTENT_FACTORY_AND_COMPLETENESS.md`](./docs/agentic-development/CONTENT_FACTORY_AND_COMPLETENESS.md). Grow role/doctrine/counterplay/attack/formation/faction/visual coverage, not raw row counts. Reuse authored unused assets where they fit before commissioning redundant models.

## 14. Agent orchestration law

Parallelism exists to reduce uncertainty and independent implementation time, not to multiply review bureaucracy.

- Default scouts: zero to two; maximum four for genuinely independent hypotheses.
- Merge scout results into one finding table.
- Workers receive one bounded player outcome and exact/bounded write surface.
- Use one independent reviewer only when subjective/high-risk judgment adds information.
- A local integrator owns cloud/Jules candidates before they become project truth.
- Collision/write-surface and integration bandwidth cap parallelism.
- Re-rank broad campaigns after every integrated unit.

The project's agentic development system is healthy when orchestration becomes simpler as the game converges, not when the control plane grows into a second game project.