<!-- LIFETIME: STABLE -->
# SpaceFace Central Brain — agentic quality convergence

This is the manager layer for broad requests such as "bring the game together", "make it feel professional",
"find what is weakest", "smooth out the wonkiness", and autonomous multi-agent development where the owner
should not have to manually inspect every candidate. It is an overlay on the existing program queue, not a
replacement queue and not a second acceptance authority.

The canonical build map still decides where agents enter. `program-dispatch` still owns admitted packet identity.
The Central Brain answers a different question: **given the work that exists and the evidence the game can produce,
what should a manager make the fleet do next so overall player quality converges rather than merely accumulating features?**

## 1. Failure mode this system exists to eliminate

SpaceFace has enough local plans. The failure is global coordination and observability:

- one subsystem can receive weeks of art passes while flight or combat remains visibly rough;
- one object is hero-quality while its neighbor is placeholder-quality;
- feature-complete code can ship without a repeatable player-route review;
- agents can prove source invariants while missing a frozen canvas, oscillating AI, partial ship, noisy camera, or lazy VFX;
- graphics work can optimize detail invisible at the chase camera;
- agents can repeatedly re-audit the same area instead of making one measurable intervention;
- open-ended INFERENCE can produce breadth without attacking the weakest exposed part of the game;
- humans become the only cross-system integration test.

The Central Brain changes the unit of optimization from **task completion** to **measured player experience**.

## 2. Non-negotiable architecture

The control loop is:

```text
observe -> reduce -> rank -> assign -> implement -> replay -> compare -> keep/revert -> update debt -> repeat
```

Each arrow is bounded. No phase is allowed to become an open-ended review campaign.

Existing infrastructure is reused before anything new is built:

- deterministic scenarios and replay: `src/testing/lab/`, `scripts/sf-lab.mjs`;
- live liveness/performance witness: `src/core/runtimeWitness.js`, `probe:runtime-witness`;
- passive state/input/frame observer: `src/observability/sessionObserver.js` and `sessionSamplers.js`;
- current queue and dependencies: `design/program/roadmap/program-queue.json` + `scripts/program-dispatch.mjs`;
- visual evidence: existing `.devshots` probes and chase-camera tooling;
- ordinary-route proof: validation broker manifests;
- current ownership: module/system/event maps plus `NOW.md` exact dirty hunks.

Do not build another game path, another combat simulator, another queue, or another acceptance vocabulary.

## 3. Manager command

For a broad quality-convergence session:

```bash
python tools/agentic/manager_cycle.py --refresh --limit 3
```

For a single manager-selected assignment:

```bash
python tools/agentic/manager_cycle.py --refresh --limit 1 --format prompt
```

The manager reads the canonical queue, current packet text, quality workstreams, and any supplied session-analysis
JSON. It emits a ranked work slate with the reason each item outranks the alternatives, the minimum observation
required before mutation, the proof after mutation, and a stop condition.

It never silently changes `program-queue.json`. A manager result is advisory until it points at an already admitted
unit or the user explicitly invoked an INFERENCE/convergence campaign. For unadmitted quality debt, it emits a
bounded `INFERENCE 1 <scope>` candidate with exact success criteria instead of inventing a PQ identity.

## 4. The quality workstreams

The machine-readable source is `design/program/AGENTIC_QUALITY_WORKSTREAMS.json`.

### CP — control-plane coherence

Purpose: prevent duplicate ownership, stale plan archaeology, and unbounded manager behavior.

Deliverables:
- deterministic ranking from current queue/evidence;
- exact write-surface conflict detection;
- one assignment per worker by default;
- no recursive manager spawning;
- every manager cycle records why it selected or skipped a workstream.

### OB — observability and replay

Purpose: make the running game inspectable to agents in time, not only in screenshots.

Required signals, incrementally added to the existing observatory rather than via a parallel recorder:
- fixed seed, tick, sim time, mode, sector and route phase;
- applied player actions;
- player position/velocity/rotation/angular velocity;
- target identity and target changes;
- AI high-level state/intent and transitions;
- fire -> projectile/beam -> contact -> damage -> death causal receipts;
- collision impulses and repeated-contact storms;
- camera position/orientation/FOV and camera jerk proxies;
- active VFX family, admission/drop counts and saturation;
- required-asset/fallback/invisible-publication events;
- frame timing and named hitch owner;
- bounded resource counts and long-session slopes.

The recorder must remain observational: no RNG calls, no gameplay writes, no update-order changes.

### RP — reproducible playtest scenarios

Purpose: turn "wonky" into a replayable failing experiment.

The canonical scenario registry is `tools/agentic/scenarios.json`. Every gameplay-feel or cross-system packet should
name at least one scenario from that registry or explain why a new scenario is required.

Core scenarios:
- boot / Continue liveness;
- straight acceleration and brake;
- slalom and 180-degree reversal;
- collision recovery;
- draw-to-fly path follow;
- stationary-target firing;
- one-on-one duel;
- mixed-role four-ship fight;
- twelve-body cohort / swarm;
- VFX saturation fight;
- first-new-asset admission;
- sector transition / floating origin;
- map/HUD readability states;
- 20-minute bounded soak.

A scenario is a state setup + input policy + semantic checkpoints + invariants. It is not a brittle pixel-script.

### FC — flight and camera feel

Purpose: make control response intentional rather than merely physically valid.

Quantities to expose and compare:
- input-to-command latency;
- acceleration and jerk;
- angular acceleration and angular jerk;
- reversal time;
- brake settling time;
- heading sign reversals in a sliding window;
- cross-track error AND achieved path speed;
- camera lag and camera jerk;
- recovery after collision or target loss.

The important rule: no agent is allowed to tune flight because a screenshot "looks sluggish". Reproduce the maneuver,
record the metrics, change one control hypothesis, replay the same seed/tape, and compare.

### CB — combat and enemy motion

Purpose: make fights readable, deliberate and varied.

Track:
- target stickiness and target churn;
- tactic/state transitions per enemy;
- blocked-action retries;
- formation dispersion and merge collisions;
- time exposed to player fire;
- shot opportunity versus shot execution;
- hit/miss and effective range distributions;
- kill causal lineage;
- concurrent active attackers;
- time spent in "nothing useful happening" states.

Oscillation detectors are advisory until calibrated, but they are excellent bug-finders: rapid tactic churn, rapid heading
reversals, repeated identical blocked actions, and multiple bodies converging on the same point should all create review
findings with exact time windows.

### PF — performance and lifecycle

Purpose: preserve visual/content quality while preventing stalls, hitches and leaks.

Use canonical density scenes. Compare distributions, not average FPS:
- p50/p95/p99 frame time;
- count and clustering of >32 ms and >100 ms frames;
- named owner coverage for hitches;
- sim/presentation/render/UI/VFX/admission phase cost;
- draw calls/programs/geometries/textures;
- heap/resource slope during the soak;
- first-use shader/asset admission spikes.

No performance win may be credited to lower default visual quality, lower population, shorter draw distance, missing VFX,
or deleted content unless that change is itself the product decision.

### VX — visual language and VFX coherence

Purpose: converge on a consistent **luminous arcade aerospace** presentation instead of maximizing realism per asset.

Visual hierarchy:
1. control/combat readability;
2. stable frame pacing;
3. silhouette and semantic VFX;
4. coherent material/color language;
5. content breadth;
6. fine material realism.

Asset maturity:
- L0: absent, invisible, fallback, partial or visibly broken;
- L1: complete and readable at shipping camera;
- L2: coherent production quality with authored material response;
- L3: premium hero treatment.

A manager must not assign L3 micro-detail while a frequently exposed L0/L1 item remains in the same route unless the
higher-priority item is blocked on a real external dependency.

VFX must be grammatical, not decorative. Every important action maps to a family with a shape, timing envelope, color
role, motion rule, audio relationship and saturation priority. Prefer structural blades/arcs/shards/trails and authored
3D or line language over soft camera-facing cards.

### CF — content factory and breadth

Purpose: use agent inference to multiply proven grammars rather than making three examples and calling the roster done.

Content work first defines reusable dimensions:
- tactical role;
- movement family;
- range band;
- durability/defense pattern;
- weapon family;
- counterplay;
- formation compatibility;
- faction visual identity;
- VFX/audio identity;
- performance cost class;
- encounter function.

A content batch is successful when it closes coverage holes across these dimensions while preserving distinctness and
performance. Recolors and stat permutations do not count as meaningful breadth unless their player role actually changes.

### UI — strategic surface quality

Purpose: keep the strategic layer and HUD at the same quality bar as the flight layer.

Every changed surface is reviewed for:
- normal-route reachability;
- hierarchy and playfield obstruction;
- state memory;
- empty/loading/error/denied states;
- pseudo-localization and text expansion;
- reduced motion / forced colors;
- 1280x720, 1920x1080 and ultrawide behavior;
- visual regression against the named baseline;
- screen silhouette distinctness and one obvious primary verb.

### CV — convergence / cross-system parity

Purpose: find the route where quality variance is greatest.

This is the manager's final pass, not a mega-refactor. It compares representative states from every major system and
creates the smallest bounded work item for the largest player-visible mismatch. Typical findings:
- one ship family is materially weaker than neighbors;
- combat effects are bright but mining effects are placeholder-like;
- menu typography is polished while one legacy screen falls back to browser defaults;
- enemy movement quality varies by archetype;
- a world object family uses procedural stand-ins next to authored ships;
- a route is smooth except first-use asset admission;
- one gameplay verb lacks paired visual/audio feedback.

## 5. Manager ranking law

Default score is intentionally simple and inspectable:

```text
priority = exposure * severity * recurrence * confidence * leverage / estimated_cost
```

Where:
- exposure: how often an ordinary player sees it;
- severity: broken > confusing > weak > polish;
- recurrence: one-off versus systemic;
- confidence: evidence quality, not agent confidence prose;
- leverage: how many future tasks inherit the fix;
- estimated_cost: coarse XS/S/M/L, never pseudo-precision.

Hard overrides:
1. crash, invisible required asset, save corruption or determinism failure;
2. input/flight/combat failure on the primary route;
3. multi-second hitch or persistent frame-liveness failure;
4. quality discontinuity at normal camera size;
5. missing feedback for a primary verb;
6. breadth/polish after the above are controlled.

## 6. Anti-loop rules

These exist because review machinery can consume infinite inference without improving the game.

1. Reconnaissance budget: at most 20% of a bounded unit before the first concrete hypothesis or mutation.
2. Scout fan-out: at most 4 read-only scouts. Their output is one merged finding table, not four new plans.
3. One intervention hypothesis at a time for feel/performance work.
4. Never rerun the same `(command, candidate, harness, environment, failure fingerprint)` unchanged.
5. After two failed repair cycles with the same causal model, mark that model falsified and select a different owner/hypothesis.
6. Do not create a new framework when an existing observer, lab, broker, pool, owner or schema can carry the need.
7. Visual review is at shipping camera and motion speed. Hero crops cannot close ordinary-route art.
8. Fixed iteration counts are not quality gates. Stop when the player-visible defect is gone and the marginal change is below the capture/review noise floor; continue only for a named remaining defect.
9. A support-only change does not satisfy an INFERENCE production unit unless the user explicitly asked for scaffolding.
10. New findings outside the assigned outcome become ranked debt, not scope expansion.

## 7. Art-production correction

The old graphics loop used a fixed seven-pass rule. That creates the exact pathology seen in the fleet: expensive polishing
with weak marginal value. Graphics now use a **screen-space marginal-value gate**:

- pass 0: establish the L0/L1 problem and shipping-camera baseline;
- pass 1: silhouette / proportion / major negative spaces;
- pass 2: material grouping, large authored surfaces, drives/canopy/wells;
- pass 3+: only named defects still visible at shipping camera.

A pass must materially change the play-size read. If two consecutive valid passes do not change the reviewer disposition
or measured silhouette/material-read defect, stop polishing and return the asset to the manager. The manager decides
whether the next dollar belongs to a different asset, VFX, flight, combat or performance.

This does **not** lower the quality bar. It prevents invisible micro-detail from consuming the budget needed to bring the
rest of the game to the same bar.

## 8. Evidence bundle for a player-facing task

Minimum useful record:

```text
task / packet / commit
scenario id + seed + input policy or tape
baseline digest
candidate digest
semantic checkpoints reached
telemetry summary
runtime-witness/perf summary when relevant
before/after captures at shipping camera when visual
regressions checked
verdict: KEEP | REVERT | LEARN_ONLY
highest remaining player-visible defect
```

A task may still use the repository's stronger packet receipt when required. This bundle is a common denominator for
manager reasoning, not a new acceptance class.

## 9. Research basis

The architecture follows techniques now appearing in practical and research game-testing systems:

- deterministic input recording/replay and checkpoint hashes for exact reproduction;
- adaptive agents operating over structured game-state abstractions rather than raw screenshots alone;
- long-horizon trace memory and reflection for task completion;
- synchronized intent/execution/presentation telemetry;
- screenshot/visual-regression review for WebGL surfaces that DOM/source checks cannot validate;
- scenario initialization -> action policy -> validation as the basic automated-game-test shape;
- LLM agents as explorers/oracles, with deterministic scripts/replays retained as the regression layer.

The important transfer is architectural: **LLMs explore and diagnose; deterministic infrastructure proves and reproduces.**
Do not ask an LLM's confidence score to become the oracle.

## 10. Definition of convergence

The game is converging when manager cycles increasingly select smaller, less severe work while the same representative
scenario matrix stays green. The goal is not "no open tasks". It is a stable quality surface:

- primary movement and combat feel intentional;
- required assets always publish complete;
- VFX and UI share a coherent visual grammar;
- common routes remain smooth under representative density;
- content has breadth without role duplication;
- every major player verb is observable and replayable by an agent;
- no frequently exposed system is multiple quality tiers behind its neighbors.
