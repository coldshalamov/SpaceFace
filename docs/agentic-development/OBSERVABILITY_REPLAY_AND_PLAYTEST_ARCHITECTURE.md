<!-- LIFETIME: STABLE -->
# Observability, Replay, and Autonomous Playtest Architecture

SpaceFace already contains the beginnings of the system needed for agents to inspect play rather than infer behavior from source. This plan finishes that system by joining the deterministic lab, Combat Lab, runtime witness, passive `sessionObserver`, route broker and media capture into one evidence pipeline.

Do not replace those systems with a parallel simulator or telemetry framework.

## 1. Principle

A game agent needs three different forms of truth:

1. **Intent** — input, AI goals, tactics, requested actions.
2. **Execution** — authoritative simulation state and causal receipts.
3. **Presentation** — what was rendered/cued, when, and at what performance cost.

A useful session artifact synchronizes all three by `seed`, `tick`, `simTime`, and render-frame alignment. This makes questions such as these machine-answerable:

- Did the player press brake and how long until the ship actually settled?
- Did an enemy change tactics six times or merely rotate while holding one tactic?
- Did a shot opportunity exist but the AI fail to fire?
- Did a collision happen once or repeatedly retrigger for 400 ms?
- Did an entity exist in simulation while its required visual failed to publish?
- Did a VFX cue get requested but dropped by saturation?
- Did the sim continue while the WebGL canvas stopped changing?
- Was a hitch caused by capture/observer overhead or by the game?

Screenshots answer almost none of these questions alone.

## 2. Existing seams to preserve

### `src/observability/sessionObserver.js`

The current observer is intentionally Phase A and in-memory. It already records:

- applied input every fixed tick;
- authoritative state samples at the configured cadence;
- asset exposure samples;
- fixed-tick canonical state hashes;
- raw render-frame performance;
- event receipts;
- explicit asset lifecycle records;
- health: dropped records, faults, rate shortfalls and overflow.

It exposes `afterInput`, `afterSimStep`, `onRenderFrame`, `recordEvent`, `recordAssetLifecycle`, `drain`, `stop`, and `health`.

The implementation comment correctly says it has no registry/main/filesystem integration yet. That is the next seam, not a reason to write a second observer.

### `src/core/runtimeWitness.js`

The runtime witness is the coarse liveness/performance classifier. Keep it for low-overhead real-route diagnosis: sim tick/time, player motion, renderer frames/draws, context/frame errors, top phase, hitch ownership and presentation liveness.

The observatory is richer evidence. The witness is the cheap tripwire. They complement each other.

### `src/testing/lab/`

The deterministic lab owns exact simulation experiments, replay, repeat/compare and differential tests. Use it wherever rendering/DOM/audio are not part of the claim.

Known limitations must remain explicit rather than being hidden behind a "lab passed" label: production-fixture coverage, save/load divergence, focused Chromium parity, bounded checkpoint coverage, lack of general multi-arm equivalence, and the missing broad seeded soak/fuzz runner.

### Combat Lab / Crucible

Combat Lab already launches the real combat owners with chosen hull, weapons, enemy package, arena and seed. Extend it as the interactive combat/AI scenario surface. Do not create an agent-only combat mode.

### Validation broker and existing route probes

Headed Browser/Electron evidence should remain broker-managed where the repository already supports it. A Central Brain scenario may point at an existing broker manifest rather than inventing another launch/retry script.

## 3. Exact live hook map

The dormant production-enforcement design already identified the correct hooks. Promote those seams incrementally.

### `src/core/registry.js`

Install guarded observer calls at the real update boundaries:

- `afterInput(state)` **immediately after** `input.update`. End-of-tick is too late because edge actions can be consumed during the tick.
- `afterSimStep(state)` after `core.lifetimeSweep`, when authoritative state for that fixed step is stable.
- `onRenderFrame(state, frameDt, alpha)` after renderer diagnostics for that presented frame.

Observer exceptions must be caught, counted and invalidate observatory evidence without affecting gameplay.

### `src/main.js`

Install a boot-local observer only when an explicit dev/runner configuration asks for it. Expose it through the existing debug/test surface. Never add observatory state to player saves or gameplay options.

### `src/core/eventTrace.js`

Retain snapshot behavior, but support sequence-preserving drain/drop accounting if needed by the runner. Silent drop-oldest behavior is invalid for acceptance evidence.

### AI intent

Read the live tactical owner's result, not invented events. Snapshot the current AI stack result/intent synchronously at state-sample time. Optional detailed traces must be enabled identically across compared runs.

### Combat execution

Prefer existing receipts and traces: fire, projectile/hit/contact/damage/kill/death and collision consequences. Add fields to existing receipts when a causal discriminator is genuinely absent; do not mirror the combat system in telemetry code.

### Presentation

Observe the current presentation cue request/applied path, frame timings, renderer diagnostics, VFX admission/drop information, and asset publication/fallback state.

## 4. Observer non-interference proof

The observer is a reader, never a game system.

Forbidden:

- `state.rng` access that advances randomness;
- emitting gameplay events;
- writing gameplay state;
- changing update order;
- scheduling decisions that affect simulation;
- storing wall-clock values in deterministic hashes;
- serializing observer state into saves.

Every serious observatory runner performs three matched executions with one seed/input tape:

1. observer ON, media ON;
2. observer ON, media OFF;
3. observer OFF, media OFF.

Required conclusions:

- deterministic hashes and ordered deterministic receipts match across all three;
- run 1 versus run 2 estimates media-capture overhead;
- run 2 versus run 3 estimates observer overhead;
- any hash drift is a hard observer failure, not a game-regression finding;
- record drops, overflow, observer fault or cadence shortfall make the observatory artifact invalid for acceptance.

## 5. Node-owned artifact publication

The browser should not write files. The Node runner owns the artifact directory, containment, atomic writes and hashes.

Recommended shape:

```text
.devshots/observatory/<scenario>/<candidate>/<run>/
  manifest.json
  input-tape.json
  observer-health.json
  records.ndjson
  state-samples.ndjson
  frame-samples.ndjson
  event-receipts.ndjson
  asset-exposure.ndjson
  findings.json
  summary.md
  media/               # only when requested
```

The manifest binds:

- scenario ID/version;
- seed;
- input policy/tape digest;
- candidate commit/digest;
- runtime profile/settings;
- observer configuration;
- record counts and hashes;
- media/capture mode;
- validity flags.

Ephemeral artifacts need not be committed. Exact-revision receipts can cite their hashes/paths where the repository's acceptance system requires evidence.

## 6. Scenario anatomy

Each canonical scenario has:

```text
id + version
purpose / player question
setup
seed policy
input policy or tape
semantic checkpoints
signals required
machine assertions
advisory detectors
capture needs
expected duration / tick budget
known limitations
```

Do not make scenarios brittle pixel scripts. Check semantic state and engine receipts, and use screenshots/video only for claims that are actually visual/temporal presentation claims.

## 7. Representative scenario matrix

The machine registry lives in `tools/agentic/scenarios.json`. The durable matrix should cover at least:

### Boot and lifecycle
- New Game to changing flight canvas.
- Continue to changing flight canvas.
- first hostile / first authored contact admission.
- sector transition and floating-origin rebase.

### Flight
- straight acceleration.
- brake/settle.
- slalom.
- 180-degree reversal.
- draw-to-fly gentle curve.
- collision recovery.
- target acquire/loss/reacquire.

### Combat and AI
- stationary target fire discipline.
- one-on-one duel.
- mixed-role four-ship encounter.
- four-ship formation/choreography.
- twelve-body cohort/swarm.
- crowded structural-VFX fight.

### Strategic UI
- Chart normal populated state.
- empty/loading/error/denied state fixtures when applicable.
- pseudo-localized and forced-colors capture matrix.

### Long session
- bounded 20-minute representative soak.
- repeated sector/encounter transitions if resource lifetime is the question.

## 8. Flight and camera metrics

"Feels sluggish" and "wonky" become hypotheses, not acceptance text. Record enough information to derive:

- input-to-command latency;
- speed/acceleration/jerk;
- angular speed/acceleration/jerk;
- reversal time;
- brake settling time;
- overshoot/settling oscillations;
- heading sign reversals in a sliding window;
- draw-to-fly cross-track error **and achieved speed**;
- camera angular/translational jerk and lag relative to player state;
- collision recovery duration.

Metrics are comparative first. Do not promote arbitrary permanent thresholds merely because they are easy to calculate.

## 9. AI/combat metrics

Record or derive:

- top-level tactic and target transitions;
- target churn per entity;
- heading reversals;
- repeated identical blocked actions;
- time within viable fire opportunity;
- shots requested versus actually executed;
- range/angle at fire;
- formation separation/dispersion;
- merge/collision incidents;
- active concurrent attackers;
- threat-visible to first hostile hit;
- damage burst windows;
- periods of combat with no useful action;
- causal attack lineage for direct/bank/chain/field/reaction/tether effects.

Oscillation/churn detectors begin as diagnostics. They become hard gates only after calibration.

## 10. Asset and presentation integrity

The observer must be able to answer for a required visible entity:

```text
simulation identity
required authored asset id/path
loader/admission state
published visual identity
fallback/procedural state
LOD
first-visible tick/frame
```

Hard classes worth detecting include:

- required entity publishes no visual;
- unexpected fallback/procedural visual on a primary route;
- LOD thrash;
- partial/stale publication across asset transitions;
- first-use admission correlated with a hitch;
- presentation cue requested but never applied;
- primary gameplay action without timely visual/audio/HUD feedback.

## 11. VFX observability

Use the existing causal VFX grammar and structural FX pool. Record:

- requested causal family;
- priority;
- admitted/dropped;
- active count by family;
- saturation/capacity;
- application tick/frame;
- related audio/HUD cue when applicable.

A saturation scenario should prove that hero/high-priority causal events remain readable while low-value decoration sheds first. The observer must not change admission.

## 12. Performance evidence

Performance uses distributions and events, not average FPS:

- p50/p95/p99 frame time;
- >32 ms / >100 ms / multi-second frame counts and clustering;
- top named phase/owner;
- named-owner coverage;
- sim/render/presentation/UI/VFX/admission buckets;
- renderer draw/program/geometry/texture changes around a hitch;
- heap/resource slope where available;
- route-stage correlation.

Always compare the same picture/content/settings. A performance candidate cannot win by silently deleting population, VFX, shadows, authored assets or default quality.

## 13. Detector calibration

The draft observatory hard-gate plan contains useful candidate detectors, but it also contains the right caution: a detector is not a hard acceptance gate merely because its threshold sounds plausible.

For a detector family to become mechanically blocking:

- build a held-out benchmark with at least 20 seeded positive and 20 seeded negative cases;
- demonstrate at least 90% sensitivity for the intended P0/P1 class;
- demonstrate no more than 10% false positives;
- inspect at least three natural sessions for integration pathologies not represented by fixtures;
- version the detector, threshold and benchmark hash.

Until then, report it as advisory or `pending`, never a fake pass.

Useful detector candidates already identified in the repo include tactic churn, heading reversal, blocked-action loops, reaction-to-first-hit, burst damage, dead air/travel ratio, repeated encounter fingerprints, unexpected asset fallback, LOD thrash, missing feedback, observer determinism drift, frame p95/hitch regression and heap growth.

## 14. Autonomous agent playtesting

An LLM is useful as an explorer and semantic critic, not as the regression oracle.

Recommended loop:

1. Launch a canonical scenario or ordinary public route.
2. Give the play agent only public controls plus structured observations that correspond to what a player could know (HUD/radar/visible state), unless the explicit task is white-box diagnosis.
3. Record all effective public inputs.
4. Let the agent attempt a goal: survive, dock, intercept, use a physics verb, complete a wave, inspect the Chart, etc.
5. Reduce the session mechanically.
6. Ask a critic to interpret anomalies/findings and select the smallest reproduction.
7. Convert valuable discoveries into deterministic input tapes/scenarios.
8. Regression thereafter is deterministic; the LLM does not need to rediscover the bug every run.

This is the key leverage point: **LLMs discover; deterministic replays remember.**

## 15. Implementation phases

### Phase A — wire the existing observer

- guarded registry/main hooks;
- runner-owned enablement;
- periodic drain;
- event/asset lifecycle bridges using real owners;
- health/overflow proof;
- observer-on/off determinism pair.

### Phase B — canonical runner and artifacts

- `observatorySessionRunner` or equivalent;
- scenario registry loader;
- same-seed/tape triple run;
- hash-bound artifact manifest;
- `tools/agentic/analyze_session.py`/runtime analyzer integration.

### Phase C — high-value semantic signals

- motion/camera metrics;
- target/tactic/action transitions;
- asset required/published/fallback identity;
- VFX admission/application;
- cue alignment.

### Phase D — autonomous play and calibrated detectors

- public-control agent runner;
- scenario/tape promotion from discoveries;
- held-out detector fixtures;
- CI only for calibrated deterministic gates.

Do not wait for Phase D to get value. Phase A+B already make cross-system debugging dramatically cheaper.