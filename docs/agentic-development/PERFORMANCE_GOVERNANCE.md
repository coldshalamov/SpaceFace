<!-- LIFETIME: STABLE -->
# Performance Governance for Agentic Development

Performance in SpaceFace is a product property: the same authored game must remain responsive and smooth. This document gives the Central Brain a way to manage performance work without turning every optimization idea into an active project or accepting quality cuts as wins.

It complements `design/PERF_BUDGET.md`, `design/PERF_OPTION_SPACE.md`, the PQ-129 evidence history and runtime-witness tooling. Those remain authoritative for their exact scopes.

## 1. Same-picture law

A performance candidate is compared against the same player-facing work unless the product change itself intentionally changes content.

Hold constant where relevant:

- scenario/seed/input policy;
- camera/settings/render scale;
- content/population;
- VFX families and default effects;
- shadows and authored asset detail;
- route and duration.

A "win" obtained by silently lowering default resolution, effects, particles, population, draw distance, asset quality or simulation richness is not a performance optimization.

## 2. Diagnose the pole before implementation

The repo's hitch campaign demonstrated why this is mandatory: several plausible optimizations were built or planned, while measured crowded presentation was already under budget; the real remaining costs were elsewhere.

Default loop:

```text
measure current route
→ name dominant event/phase/resource
→ form one causal hypothesis
→ make the smallest intervention
→ run a matched A/B
→ keep or revert
```

If the assumed pole does not exist, close the candidate as a no-op and preserve the evidence. Do not implement it because the technique is fashionable.

## 3. Distribution and event metrics

Average FPS is insufficient. Record:

- p50/p95/p99 frame time;
- count and clustering of >32 ms and >100 ms frames;
- multi-second freezes separately;
- named-owner coverage of hitch events;
- sim/render/presentation/UI/VFX/admission phase costs;
- draw calls, programs, geometries, textures around events;
- first-use compile/upload/admission deltas;
- memory/resource slopes for long sessions.

Use event windows. One 3-second brick can be hidden by an excellent p95.

## 4. Runtime liveness is distinct from speed

A live HUD with a frozen 3D canvas is not "low FPS"; it is a presentation-liveness failure. Keep runtime-witness style signals that distinguish:

- simulation tick/time moving;
- player state moving;
- render frame count moving;
- presented picture changing where observable;
- repeated frame errors/context loss;
- lifecycle stage.

This class receives release-blocking priority even if steady-state frame timing is good.

## 5. Instrumentation blind spots

Treat an unexplained event as an instrumentation problem before another speculative optimization pass when evidence is known to be incomplete.

A useful performance artifact states:

- percentage of hitches assigned a named owner;
- known uninstrumented regions;
- whether GPU timestamps exist;
- capture/observer overhead;
- whether the route was synthetic or organic;
- whether asset settlement/first-use completed.

Do not promote a causal conclusion beyond instrument coverage.

## 6. First-use and admission

Asset/shader compilation and upload must be treated as lifecycle work, not just average renderer cost.

Track:

```text
asset requested
asset decoded/composed
program keys introduced
geometry/texture residency introduced
admission/precompile state
first draw
frame cost around each event
```

Prefer bounded precompile/admission for the asset that is actually approaching the glass over broad prewarming of hypothetical populations.

The observatory should correlate first-visible asset identity with frame hitches so agents can see whether a new content/graphics batch created a first-use regression.

## 7. Performance work families

The exhaustive option space can remain large, but the manager should think in causal families:

### Submission / visibility
Cull off-glass work, batch compatible opaque work, projected-size LOD, reduce state changes.

### Admission / first use
Compile/upload/decode ahead of first visible use in bounded slices.

### Simulation / AI
Keep player/combat authority responsive; cadence/sleep inactive cohorts deterministically; reuse spatial indices.

### Scene graph / CPU preparation
Avoid off-glass traversals, per-frame allocations and duplicated owner work.

### Post/present
Only optimize bloom/HDR/AA when measured as the pole and preserve image parity.

### Resource lifetime
Bound residency/pools and prove long-session plateaus before adding governors.

### Platform/backend
Worker/WASM/WebGPU/native are conditional responses to measured structural limits, not rewards for skipping nearer fixes.

## 8. Decision gate for large optimizations

Before a Worker, WASM island, WebGPU path or native renderer project is admitted, require:

- a reproducible representative bottleneck;
- evidence that smaller structural fixes are exhausted or insufficient;
- a narrow vertical slice against the same input/state/presentation contracts;
- explicit rollback/fallback strategy where applicable;
- measured gain floor that justifies complexity.

Large platform work is allowed; premature platform work is not.

## 9. Performance and content breadth

As content grows, costs must scale with the visible/active table rather than total authored content.

Design content for scalability:

- off-table AI/cadence where legal;
- LOD and table-relative VFX;
- shared material/program families;
- bounded entity/spawn budgets;
- prefetch/admission based on approach;
- pooling/instancing;
- inactive world systems sleeping or ticking cheaply.

Do not reduce the game's intended breadth merely because the current implementation scales poorly.

## 10. Manager priority

Performance debt receives high priority when it is:

- a multi-second or route-liveness failure;
- recurrent on primary routes;
- a regression caused by newly landed work;
- a structural blocker to content/visual breadth;
- a long-session resource failure likely to end play.

Small p95 improvements on already-good scenarios usually rank below severe control/combat/integrity debt.

## 11. Experiment discipline

For performance, one causal intervention at a time is especially important.

- Record baseline digest and machine/profile.
- Run enough matched pairs to distinguish noise for the magnitude being claimed.
- If a candidate improves one metric and worsens hitch count/p99, it does not automatically win.
- If the result is noisy, improve the experiment before adding more code.
- Never repeat the same failed command/candidate/environment expecting a different truth.
- Retain rejected high-cost hypotheses so future agents do not rediscover them blindly.

## 12. Performance acceptance bundle

A useful bundle contains:

```text
scenario + seed/input
platform/GPU/runtime profile
baseline/candidate digest
same-picture statement
frame distribution
hitch event table + named owners
phase timing
renderer/resource deltas if relevant
capture/observer mode
determinism/parity result
KEEP | REVERT | NO_OP
known instrument limits
```

## 13. Autonomous performance debugging

Agents can debug performance effectively when traces are structured.

The manager should ask specialist agents to answer distinct questions, for example:

- which phase owns the worst event?
- what object/program/resource changed in the event window?
- is the event reproducible under replay?
- does observer/capture overhead explain it?
- is the object actually on the player table?

Merge those into one causal model. Do not dispatch four agents to independently rewrite the renderer.

## 14. Definition of performance convergence

Performance is converged for a milestone when representative primary routes:

- remain live;
- meet their named frame budgets with protected p99/hitch behavior;
- have no unexplained recurring first-use bricks;
- preserve authored content and default quality;
- keep resource growth bounded over the representative session;
- expose enough telemetry that a future regression can be localized without another multi-day guess cycle.

The target is smooth, rich play—not an impressive benchmark in an empty scene.