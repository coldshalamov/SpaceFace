<!-- LIFETIME: STABLE -->
# Agentic Development Implementation Roadmap

This roadmap turns the Central Brain architecture into staged implementation. It deliberately builds on existing SpaceFace owners instead of demanding a rewrite before agents can get value.

The stages are ordered by leverage. Each stage is useful on its own.

## Phase 0 — make broad routing quality-aware

### Outcome

When an agent is told "next", "develop the game", "overnight", or another broad request, it no longer blindly spends the campaign on one historic graphics family. It selects among dependency-ready admitted work using current player-facing quality evidence.

### Work

- Make `CANONICAL_BUILD_MAP.md` name `design/program/CENTRAL_BRAIN.md` as the broad-development manager layer.
- Preserve direct `program-dispatch --id PQ-XXX` for exact assignments.
- Remove wording that makes `PQ-050` the universal unnamed/campaign default.
- Update `design/program/AGENT_TASK_PROMPTS.md` so its generic prompts use the same routing.
- Keep explicit graphics, hitch, Asteroid Works, Crucible, Jules and INFERENCE doors intact.
- Add a control-plane regression test that fails if the stale PQ-050-default phrases return.

### Done when

An agent entering through the build map can distinguish exact task, broad quality convergence, explicit campaign, INFERENCE and Jules without reading an unrelated historical handoff.

## Phase 1 — manager over the existing PQ graph

### Outcome

A deterministic tool can produce an inspectable ranked slate of dependency-ready units without changing queue truth.

### Existing base

- `scripts/program-dispatch.mjs` and `scripts/lib/programControlPlane.mjs` own queue validation/readiness.
- `design/program/AGENTIC_QUALITY_WORKSTREAMS.json` supplies quality-classification hints.
- `tools/agentic/manager_cycle.py` is the first advisory selector.

### Work

- Keep dependency readiness identical to the PQ control plane.
- Classify candidate units into integrity, flight, combat/AI, performance, presentation/VFX, UI, content/breadth, prestige art, etc.
- Consume optional quality findings/session summaries.
- Show score factors, skip reasons and write-conflict hints.
- Add campaign composition so one family cannot consume every unnamed slot merely due to task count.
- Support JSON and copy-ready worker prompt output.
- Never auto-edit `program-queue.json`.

### Done when

Given the same repo/evidence, the tool returns the same ranked dependency-ready slate and explains why each unit ranks where it does.

## Phase 2 — wire the existing Gameplay Observatory

### Outcome

A normal play session becomes machine-readable over time without perturbing gameplay.

### Existing base

- `src/observability/sessionObserver.js` / `sessionSamplers.js`;
- `src/core/runtimeWitness.js`;
- deterministic lab;
- event trace and current combat/presentation receipts.

### Work

1. `registry.js`: guarded `afterInput` immediately after input update; `afterSimStep` after lifetime sweep; `onRenderFrame` after renderer diagnostics.
2. `main.js`: runner-owned opt-in observer creation/debug exposure; no save state.
3. Periodic browser drain to a Node-owned runner; no filesystem writes in gameplay code.
4. Bridge real event receipts and asset-publication state.
5. AI intent sampling from the actual tactical stack.
6. Observer health and drop/overflow invalidation.
7. Observer ON/OFF determinism proof.

### Done when

A fixed input scenario produces lossless synchronized input/state/frame/event records, observer health is valid, and simulation hashes match with the observer disabled.

## Phase 3 — canonical scenario runner and triple comparison

### Outcome

Agents can replay the same behavior before/after and distinguish game cost from observability/capture overhead.

### Work

- Load scenario metadata from `tools/agentic/scenarios.json`.
- Reuse `sf lab` for deterministic scenarios and existing public Browser/Electron route tooling for presentation claims.
- Build Node-owned artifact manifests.
- Run:
  1. observer-on/media-on;
  2. observer-on/media-off;
  3. observer-off/media-off.
- Compare deterministic hashes/ordered receipts.
- Publish capture overhead and observer overhead separately.
- Feed records to `tools/agentic/analyze_session.py` / runtime analyzer.

### Done when

One command can produce a hash-bound session bundle for a canonical scenario and reject evidence when determinism or recording health fails.

## Phase 4 — experiential telemetry

### Outcome

"Wonky" behavior is reducible to concrete time windows and comparable metrics.

### Flight/camera

- command latency;
- speed/accel/jerk;
- angular response/jerk;
- reversal and brake settle;
- heading reversal/oscillation;
- path error plus achieved speed;
- camera lag/jerk;
- collision recovery.

### Combat/AI

- tactic/target changes;
- blocked action retries;
- fire opportunities/execution;
- formation dispersion/collisions;
- concurrent attackers;
- threat-to-first-hit windows;
- causal attack lineage.

### Assets/presentation

- required asset versus published/fallback visual;
- first visible frame;
- LOD transitions;
- VFX requested/admitted/dropped/applied;
- primary action-to-feedback latency.

### Done when

The manager can point at a precise reproduction and say why it considers a flight/AI/presentation symptom quality debt without relying on prose intuition.

## Phase 5 — quality report and cross-system parity

### Outcome

A generated report tells agents which frequently exposed system is most behind its neighbors.

### Work

- Generate the representative scenario matrix from `QUALITY_SCORECARD.md`.
- Record `BLOCKED/RED/YELLOW/GREEN/UNKNOWN` with evidence freshness.
- Record visible maturity L0–L3 separately.
- Identify the highest discontinuities rather than calculating one opaque score.
- Feed those findings into the manager ranking.
- Keep the report ephemeral/generated unless a milestone receipt needs a snapshot.

### Done when

A broad campaign can re-evaluate after every unit and naturally move from core defects to presentation/breadth/polish as the quality surface evens out.

## Phase 6 — autonomous playtest exploration

### Outcome

An LLM agent can use public controls to explore/attempt representative player goals; useful discoveries become deterministic regression scenarios.

### Work

- Expose structured observations equivalent to public HUD/radar/visible knowledge for black-box play.
- Use browser automation/input, not direct state mutation.
- Record every effective public action.
- Give the explorer bounded goals: dock, survive, intercept, use a physics verb, finish a wave, inspect a strategic screen.
- Use white-box telemetry only for the critic/diagnosis stage.
- Minimize a discovered failure into deterministic lab/replay form.

### Done when

The project no longer depends on a human manually flying every candidate to discover common integration defects, while deterministic replay remains the actual regression oracle.

## Phase 7 — calibrated quality detectors

### Outcome

Only reliable objective detectors become hard mechanical gates.

### Work

For each candidate detector:

- at least 20 seeded positive + 20 seeded negative held-out cases;
- ≥90% intended sensitivity;
- ≤10% false positives;
- inspect at least three natural sessions;
- version detector/threshold/benchmark;
- negative-test the check itself by injecting a known failure.

Candidate families:

- required visual fallback/invisible publication;
- observer determinism drift;
- tactic/target churn;
- heading reversal/block loops;
- LOD thrash;
- missing primary feedback;
- reaction/burst fairness;
- dead air/encounter repetition;
- frame/hitch/heap regression.

### Done when

A hard gate is trusted because it has demonstrated discrimination, not because a plan named a threshold.

## Phase 8 — Jules/cloud swarm integration

### Outcome

Large daily cloud-agent capacity supports the highest-priority player outcomes without overwhelming integration.

### Work

- Preserve the existing 1000-task bank and collision keys.
- Map Central Brain workstreams to suitable Jules lanes.
- Prefer low-collision test hardening, bug hunt, determinism, isolated UI/content/data and bounded fixes.
- Cap simultaneous dispatch by collision key/write surface and local integration bandwidth.
- One cloud task per branch/PR.
- Local integrator rebases, reviews and runs authoritative proof.
- Count merged player-value work, not dispatched requests.

### Done when

Cloud inference increases throughput while the main queue remains coherent and local agents are not spending all their time resolving overlapping speculative PRs.

## Phase 9 — content factory scale-out

### Outcome

Agent capacity grows the game by filling meaningful coverage holes across enemies, encounters, factions, missions, world props and strategic surfaces.

### Work

- Use `CONTENT_FACTORY_AND_COMPLETENESS.md` coverage matrices.
- Reuse Crucible attack/content schemas and validators.
- Generate candidates against explicit role/doctrine/counterplay gaps.
- Reuse unused/authored assets before commissioning new ones.
- Run isolated + mixed-role + crowded scenario validation.
- Cut variants that do not alter player decisions.
- Track performance cost class.

### Done when

New batches create recognizable tactical/strategic variety rather than raw row count.

## Phase 10 — visual/VFX production convergence

### Outcome

The game's common routes have controlled visual maturity and causal effect language without spending the entire agent budget on microscopic realism.

### Work

- Apply L0–L3 maturity across common exposed families.
- Use screen-space marginal-value stopping.
- Batch repeated manufactured families appropriately.
- Extend/reuse PQ-134 structural causal VFX grammar.
- Observe saturation/admission.
- Run neighboring-family parity captures.
- Tie new visual content to first-use/performance evidence.

### Done when

No common route contains unintended L0 gaps, core families sit at coherent L1/L2 quality, primary effects explain cause, and remaining L3 work is explicitly premium.

## Phase 11 — continuous convergence loop

At maturity, the system is intentionally boring:

```text
refresh quality matrix
→ rank ready work
→ dispatch bounded unit(s)
→ integrate
→ replay representative cells
→ refresh
```

The amount of special orchestration should decrease as the game converges. If the Central Brain grows into a giant separate project that requires constant maintenance, simplify it.