# SF-PORT-07 — Floor-Aware Performance Attribution Research

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> Historical planning handoff only. This document proposes measurement and acceptance changes. It does not modify runtime behavior, lower authored quality, delete visuals, establish current program status, or claim implementation, focused-green checks, player-route acceptance, or integration.

| Field | Value |
|---|---|
| Task | `SF-PORT-07` |
| Title | Floor-aware performance attribution research |
| Exact base commit | `8f1c630f5ebf26f209052b8164f3cdf024ffd06f` |
| Requested base branch | `codex/delegation-base-20260723` |
| Result branch | `agent/chatgpt-performance-attribution-20260723` |
| Allowed repository output | `docs/handoffs/chatgpt-portfolio-20260723/FLOOR_AWARE_PERFORMANCE_ATTRIBUTION.md` |
| Revision | Independent-controller corrections 1–7 incorporated |
| Disposition | `planning_complete`; runtime `not implemented`; `not integrated` |

## 0. Authority, scope, and evidence vocabulary

This report follows the authority and completion boundaries in [CANONICAL_BUILD_MAP.md](../../../CANONICAL_BUILD_MAP.md), root [AGENTS.md](../../../AGENTS.md), [design/program/NOW.md](../../../design/program/NOW.md), [program-queue.json](../../../design/program/roadmap/program-queue.json), [00_EXECUTION_PROTOCOL.md](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md), [scripts/AGENTS.md](../../../scripts/AGENTS.md), [test/AGENTS.md](../../../test/AGENTS.md), and [docs/AGENTS.md](../../AGENTS.md).

**Controller-supplied fact:** PQ-017 is in progress and not yet integrated. No other current PQ-017 fact is asserted here.

Every repository statement is labeled as one of:

- **Verified existing behavior** — checked at the exact base against a named path, symbol, or check.
- **Inference** — a causal interpretation consistent with evidence but not proved by it.
- **Proposal** — future work, not present behavior.
- **Unknown** — the inspected evidence cannot decide the question.

The current write set is exactly this new historical handoff. All runtime, renderer, graphics, Blender, manifest, browser-GPU, HUD, worldbuilding, registry, save-schema, package, input, combat, AI, Massline, tether, program-ledger, source, test, script, asset, and existing-handoff paths remain untouched.

## 1. Executive decision

**Proposal:** retain SpaceFace's literal shipping budgets while adding a separate, floor-aware causal-attribution layer. A display, browser, compositor, or hardware floor may explain a red measurement; it must never silently turn that red shipping contract green.

The minimum viable program has five rules:

1. `profileClass` is assigned by the controller as exactly `target`, `floor`, or `diagnostic`. It is never inferred from FPS, frame-time clusters, device identity, or a control result.
2. Every block is bound to stable machine identity and run-profile identity, including operating-system build, CPU, RAM tier, GPU, display, browser/runtime, and power/profile state.
3. Coverage is duration-first and profile-aware: at least 15 seconds and at least 90% of the callbacks expected at the assigned profile's allowed period.
4. Six fresh-process paired blocks are exploratory only. A causal conclusion requires new held-out confirmatory blocks under a predeclared exact paired randomization and block-level interval.
5. Injected scenarios and diagnostic variants are mechanism evidence only and are always `acceptanceEligible: false`.

The implementation should extend the existing performance owners rather than create a parallel harness. No authored-quality reduction, visual deletion, default diagnostic isolation, or second acceptance system is proposed.

## 2. Current-state inventory

| ID | Classification | Exact-base finding | Grounding |
|---|---|---|---|
| V-01 | Verified existing behavior | SpaceFace documents a 16.7 ms target, a 33.3 ms low-end floor, fixed-60 Hz simulation, p95/p99/hitch evidence, and a ban on quality-reducing performance fixes. | [design/PERF_BUDGET.md](../../../design/PERF_BUDGET.md), targets, measurement bar, optimization doctrine, and capture protocol. |
| V-02 | Verified existing behavior | Final acceptance requires exactly three distinct, clean, same-commit, headed profile runs and three comparable matrices. Diagnostic matrices cannot waive a primary profile miss. | `PERFORMANCE_FINAL_ACCEPTANCE_RUNS`, `evaluatePerformanceFinalAcceptance()`, and `validateProfile()` in [scripts/lib/performanceFinalAcceptance.mjs](../../../scripts/lib/performanceFinalAcceptance.mjs); [test/performance-final-acceptance.test.mjs](../../../test/performance-final-acceptance.test.mjs). |
| V-03 | Verified existing behavior | The profile validator currently requires `raf.frame.p95.target <= 16.7`, absolute zero for `raf.frame.hitchesOver32.max`, and a floor row no greater than 34.3. | `requireProfileBudget()` calls in `validateProfile()` in [scripts/lib/performanceFinalAcceptance.mjs](../../../scripts/lib/performanceFinalAcceptance.mjs). |
| V-04 | Verified existing behavior | The strict profile producer currently defaults `FRAME_FLOOR_MS` to 34.3 and `HITCH_FRAME_MAX` to zero. | top-level defaults in [scripts/probe-performance-profile.mjs](../../../scripts/probe-performance-profile.mjs). |
| V-05 | Verified existing behavior | The budget document instead names the canonical floor as 33.3 ms and says hitch count must not increase versus baseline. | [design/PERF_BUDGET.md](../../../design/PERF_BUDGET.md), pass criteria. |
| V-06 | Verified existing behavior | The attribution runner already captures raw rAF intervals, phase timing, opt-in per-system and render-work timing, GPU-timer capability, scene structure, admission readiness, renderer residency, heap observations, long-task/optional-GC observations, settings, route proof, and restoration state. | `sampleRafWindow()` in [scripts/lib/releaseSoakProbe.mjs](../../../scripts/lib/releaseSoakProbe.mjs). |
| V-07 | Verified existing behavior | The closure summary retains p50/p95/p99/max, frames over fixed thresholds, estimated missed vsyncs, `multiStepSimulationFrames`, and `backlogSheddingFrames`, but not the full step-count distribution or maximum shed steps per frame. | `summarizeFrameSamples()` in [scripts/lib/performanceClosureContracts.mjs](../../../scripts/lib/performanceClosureContracts.mjs); [test/performance-closure-contracts.test.mjs](../../../test/performance-closure-contracts.test.mjs). |
| V-08 | Verified existing behavior | Scenario preparation can inject deterministic fleets or poses, wait for authored assets and admission queues, and restore player/target/time/focus/physics state. | `preparePerformanceScenario()`, `waitForPerformanceScenarioReady()`, and `restorePerformanceScenario()` in [scripts/lib/performanceScenarioDriver.mjs](../../../scripts/lib/performanceScenarioDriver.mjs); [test/performance-scenario-driver.test.mjs](../../../test/performance-scenario-driver.test.mjs). |
| V-09 | Verified existing behavior | Diagnostic variants already isolate simulation, bloom, background, entity classes, VFX, and materials, with exact restoration required. | `ATTRIBUTION_DIAGNOSTIC_VARIANTS` and `validatePerformanceAttribution()` in [scripts/lib/releaseSoakContracts.mjs](../../../scripts/lib/releaseSoakContracts.mjs); [test/performance-attribution.test.mjs](../../../test/performance-attribution.test.mjs). |
| V-10 | Verified existing behavior | `ensurePerfRuntime()` uses bounded rings; per-system and render-work attribution are default-off; frame samples expose step, backlog, callback, untracked, phase, and spatial counters. | [src/core/perfRuntime.js](../../../src/core/perfRuntime.js), `RING_N`, measurement gates, `readFrameSample()`, `recordSpatialHash()`, and `getReport()`. |
| V-11 | Verified existing behavior | The registry owns ordered sim and render dispatch and takes per-system clocks only when explicitly enabled. | `step()` and `renderUpdate()` in [src/core/registry.js](../../../src/core/registry.js). |
| V-12 | Verified existing behavior | Scene metrics already expose visible structure, authored admission, mesh queue, compile pending, recent resources/admissions, active admission jobs, program count, and asset-residency state. | `collectPerformanceSceneStructure()` and `collectPerformancePipelineReadiness()` in [scripts/lib/performanceSceneMetrics.mjs](../../../scripts/lib/performanceSceneMetrics.mjs). |
| V-13 | Verified existing behavior | A blank/WebGL-clear control probe exists, but it is a separate process and defaults to headless unless headed flags are supplied. | [scripts/probe-raf-control.mjs](../../../scripts/probe-raf-control.mjs). |
| V-14 | Verified existing behavior | Browser and Electron share the release-soak public route and owned cleanup machinery; the attribution entrypoint currently produces browser attribution only. | `runReleaseSoakProbe()`, `launchBrowser()`, `launchElectron()`, and `runPerformanceAttributionProbe()` in [scripts/lib/releaseSoakProbe.mjs](../../../scripts/lib/releaseSoakProbe.mjs). |
| V-15 | Verified existing behavior | Spatial counters aggregate calls and candidates, and a batch is counted as one physical query even when it represents multiple logical radius requests. | `queryRadius()`, `queryRadiusBatch()`, and `flushPerfCounters()` in [src/core/spatialHash.js](../../../src/core/spatialHash.js); [scripts/check-spatial-hash-contract.mjs](../../../scripts/check-spatial-hash-contract.mjs). |
| V-16 | Verified existing behavior | The live status records marginal frame/sim debt and spatial-query attribution debt without proving a current causal owner. | strict-performance debt rows in [design/program/NOW.md](../../../design/program/NOW.md). |

### 2.1 Explicit contract debt requiring migration

| Surface | Current rule | Correction required |
|---|---|---|
| [design/PERF_BUDGET.md](../../../design/PERF_BUDGET.md) | floor p95 `<= 33.3 ms`; raw frames `>32 ms` tracked and required not to increase versus baseline | Retain 33.3 as canonical. Separate raw `>32` reporting from floor delivery-multiple hitch gating. Decide whether historical nonincrease remains advisory or comparative regression policy. |
| [scripts/lib/performanceFinalAcceptance.mjs](../../../scripts/lib/performanceFinalAcceptance.mjs) | accepts floor row up to 34.3 and requires absolute zero `>32 ms` frames | Migrate to assigned-profile contracts; never infer floor from observed FPS. |
| [scripts/probe-performance-profile.mjs](../../../scripts/probe-performance-profile.mjs) | defaults 34.3 and zero `>32 ms` | Produce canonical profile-aware rows and preserve legacy values only as explicitly named migration evidence. |

This inconsistency is existing debt, not a reason to weaken the target gate or to grandfather unknown floor evidence.

## 3. Proposed measurement identity

### 3.1 Controller-assigned `profileClass`

Every run manifest must contain:

```json
{
  "profileClass": "target",
  "profileAssignment": {
    "assignedBy": "controller identity",
    "assignmentId": "content-hashed immutable id",
    "assignedAt": "ISO-8601",
    "rationale": "named hardware/profile contract"
  }
}
```

Rules:

- Allowed values are exactly `target`, `floor`, and `diagnostic`.
- Producers require the assignment before launching the runtime.
- Validators recompute acceptance from the assigned class but never choose the class.
- A fast floor machine remains `floor`; a slow target machine remains `target` and fails target if it misses.
- `diagnostic` is always `acceptanceEligible: false`.
- Changing class requires a new assignment ID and a new experiment; it cannot re-label existing evidence.

### 3.2 Stable machine fingerprint

**Proposal:** produce a normalized `machineIdentity` and hash it as `machineFingerprint`. The normalized object includes:

- OS family, edition, version, and build;
- CPU vendor/model and physical/logical core counts;
- installed RAM tier (`<=8`, `>8–16`, `>16–32`, `>32–64`, `>64 GiB`) and exact bytes when policy permits;
- GPU adapter vendor/device/driver, ANGLE/backend, WebGL version, and hardware-acceleration status;
- stable host-lab identifier that does not contain a username or path.

Display choice, browser profile, power state, thermal drift, and window placement are intentionally excluded from the machine fingerprint because they can vary between runs on the same machine. They belong to the run-profile identity below.

### 3.3 Run-profile fingerprint

`runProfileFingerprint` binds:

- `machineFingerprint`;
- controller-assigned `profileClass` and assignment ID;
- browser product, exact version/revision, executable identity, V8 version, launch arguments, profile/cache identity, and headed state;
- for Electron: Electron, Chromium, V8, app, launcher, and package identity;
- active GPU/display identity, display ID, refresh estimate, resolution, scale factor, color depth/HDR where available, window bounds, focus, visibility, and occlusion state;
- OS power mode, application power preference, AC/battery state, and any controller-provided performance-profile label;
- viewport, DPR, default video settings, seed, locale, and runtime kind;
- cold/warm lifecycle class;
- exact commit and clean-worktree fingerprint.

Unknown fields are explicit `{ "status": "unavailable", "reason": "..." }`, never omitted. Comparability fails closed on any field designated required by the assigned profile contract.

### 3.4 Control-derived cadence is not profile assignment

Same-process controls estimate the active delivery period `T` and its stability. They may classify cadence or floor interaction, but they must not assign `profileClass`. A 33 ms control on a target assignment is a target environment problem, not permission to relabel the run as floor.

## 4. Proposed profile-aware contracts

### 4.1 Target

A target-eligible primary window requires:

```text
p95(frameMs) <= 16.7 ms
rawFramesAbove32Ms == 0
floorDeliveryHitches == 0
coveragePass == true
```

Raw `>32 ms` is a literal target gate. Delivery-multiple classification remains useful diagnosis but does not replace the target rules.

### 4.2 Floor

A floor-eligible primary window requires:

```text
p95(frameMs) <= 33.3 ms
floorDeliveryHitches == 0
coveragePass == true
```

For floor evidence:

- `rawFramesAbove32Ms` is always reported.
- Non-zero raw `>32 ms` count is not an automatic failure because a nominal two-vsync delivery at common 60 Hz timing can exceed 32 ms.
- A floor hitch is instead a delivery multiple beyond the allowed floor multiple.

Let `T` be the stable same-process control-derived display period. Then:

```text
allowedFloorMultiple = max(1, round(33.3 / T))
deliveryMultiple(frame) = max(1, round(frameMs / T))
floorDeliveryHitch(frame) = deliveryMultiple(frame) > allowedFloorMultiple
```

A frame is valid for this classification only when its residual to the nearest delivery multiple is within the predeclared cadence tolerance and the control bracket is stable. Invalid/unclassifiable frames remain visible and can fail coverage; they are never rounded into innocence.

### 4.3 Diagnostic

`profileClass: diagnostic` is never acceptance evidence. It may use alternate cadence, headless mode, injected load, hidden surfaces, paused simulation, material override, forced GC, or other controlled mechanisms only when fully labeled and restored.

```text
acceptanceEligible = false
```

### 4.4 Contract result and causal result are separate

Every report has two independent outputs:

```json
{
  "contractResult": "pass | fail | ineligible",
  "causalDisposition": "floor_bound | game_delta | mixed | no_detectable_delta | inconclusive | not_tested"
}
```

A floor-bound target miss remains `contractResult: fail`. A passing floor contract does not prove absence of game cost. Diagnostic variants can change `causalDisposition` but cannot change primary eligibility.

## 5. Duration-first, profile-aware coverage

No universal “900 intervals” or fixed 30-second rule is proposed. Each measurement window must satisfy both time and callback coverage.

### 5.1 Minimum duration

```text
measuredDurationMs >= 15000
```

Warm-up is outside the measured duration and is labeled separately.

### 5.2 Expected callback accounting

Let the allowed period `P` be:

| Assigned class | Coverage period `P` |
|---|---:|
| `target` | 16.7 ms |
| `floor` | 33.3 ms |
| `diagnostic` | explicitly declared by the diagnostic manifest |

For measured duration `D`:

```text
expectedIntervals = floor(D / P)
expectedCallbacks = expectedIntervals + 1
observedCallbacks = number of rAF callbacks seen in the window
observedIntervals = max(0, observedCallbacks - 1)
validIntervals = intervals satisfying every validity predicate
invalidIntervals = observedIntervals - validIntervals
droppedExpectedIntervals = max(0, expectedIntervals - validIntervals)
coverageRatio = validIntervals / expectedIntervals
coveragePass = D >= 15000 && coverageRatio >= 0.90
```

The artifact must report all seven counts and the actual measured duration. `invalidIntervals` carry reason counts such as hidden document, focus loss, transition coverage, timestamp non-monotonicity, unsupported cadence residual, active admission when steady residency was required, measurement-gate failure, or missing route proof.

No window may pass by extending until a desired percentile appears. Duration and extension policy are frozen before launch.

## 6. Evidence origin and acceptance eligibility

Every window must contain:

```json
{
  "evidenceKind": "primary | diagnostic",
  "scenarioOrigin": "public_route | scenario_driver_injected | diagnostic_variant | synthetic_contract",
  "stateInjected": false,
  "diagnosticVariant": "baseline",
  "acceptanceEligible": true
}
```

`acceptanceEligible` is computed by the validator and is true only when all are true:

```text
evidenceKind == primary
scenarioOrigin == public_route
stateInjected == false
diagnosticVariant == baseline
profileClass in {target, floor}
default authored quality is unchanged
public route and input proof pass
worktree, machine, runtime, run-profile, settings, and lifecycle identities are stable
coveragePass == true
```

Any scenario prepared through injected state, any diagnostic variant, any synthetic fixture, and any non-public input path is forced to:

```text
evidenceKind = diagnostic
acceptanceEligible = false
```

Injected scenarios remain valuable for renderer admission, scaling, VFX, spatial-query, autosave, and residency mechanism evidence. They simply cannot become player-route acceptance by good performance.

## 7. Cold/warm, admission, residency, and GC separation

### 7.1 Lifecycle classes

Each block declares one lifecycle class:

| Class | Meaning |
|---|---|
| `cold_process` | New OS process and browser/Electron runtime; no reuse from the prior block. |
| `cold_profile` | New runtime profile/cache identity; route and authored admission begin cold. |
| `cold_route` | Existing process/profile, first entry into the measured route. |
| `warm_assets` | Authored assets, mesh queue, pipeline compilation, and program residency have reached the declared steady gate. |
| `warm_revisit` | Same route revisited after a completed warm-assets window with unchanged residency identity. |

Classes are separate strata and are never pooled into one p95. Transition scenarios such as jump admission are reported as transition evidence, not steady-state evidence.

### 7.2 Admission and residency gates

Reuse [scripts/lib/performanceSceneMetrics.mjs](../../../scripts/lib/performanceSceneMetrics.mjs) and existing final-acceptance residency checks. A steady window requires:

- zero active admission jobs at start and end;
- zero remaining mesh builds at start and end;
- unchanged program count;
- no renderer-resource growth in steady residency scenarios;
- explicit authored/fallback/pending counts;
- recent resource/admission chronology retained;
- default authored quality and visuals preserved.

Cold windows instead retain admission duration, queue depth, resource chronology, first-frame/first-authored readiness, shader/program growth, and transition hitches. They do not masquerade as warm steady state.

### 7.3 Garbage collection capability

GC evidence is capability-qualified:

```json
{
  "gcCapability": {
    "status": "available | unavailable | unsupported | observer_error",
    "source": "performance-observer | cdp-forced-endpoint | none",
    "reason": null
  },
  "gcEvents": []
}
```

“No GC events” is meaningful only when the observer is available and active. Forced collection through CDP is permitted only for labeled retained-memory endpoints, never inside a primary steady frame window. Heap deltas, long tasks, and GC signals retain monotonic timestamps so temporal overlap with hitches can be inspected without claiming causality from coincidence alone.

## 8. Fixed-step and backlog evidence

Every raw frame sample already has or can derive fixed-step state. The closure summary must retain:

```json
{
  "stepsThisFrameDistribution": {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "other": 0
  },
  "maxStepsThisFrame": 0,
  "multiStepSimulationFrames": 0,
  "backlogSheddingFrames": 0,
  "totalShedSteps": 0,
  "maxShedStepsPerFrame": 0
}
```

Rules:

- The distribution is computed from raw `stepsThisFrame`, not from an end snapshot.
- `multiStepSimulationFrames` counts samples with `stepsThisFrame > 1`.
- `backlogSheddingFrames` counts per-frame positive deltas in the cumulative shedding counter or explicit `shedBacklog` truth.
- `totalShedSteps` and `maxShedStepsPerFrame` use per-frame `shedSteps`, not the cumulative total.
- These fields remain descriptive in diagnostics and profile-aware gates may later set explicit limits; they are never discarded when frame pacing is floor-bound.

This preserves the loop's causal chain: a render/present delay can create extra fixed steps, which can amplify CPU work and eventually shed backlog.

## 9. Architecture and event/data flow

The program extends existing owners:

```text
controller assignment
  -> immutable run manifest
       profileClass + assignment id
       machine fingerprint
       browser/Electron/display/power run profile
       lifecycle class
       experiment phase and arm
  -> existing owned runtime launch
  -> public route proof
  -> same-process control-before
  -> optional scenario preparation
       public route OR explicitly injected diagnostic
  -> readiness/admission gate
  -> >=15 s raw rAF window
       frame timing + callback coverage
       sim step/backlog fields
       phase/system/render-work snapshots
       GPU capability/timers
       admission/residency/resource chronology
       long-task/GC capability and events
  -> exact variant/scenario restoration
  -> same-process control-after
  -> cleanup and artifact hashing
  -> block-level paired effect
  -> exploratory or held-out confirmatory analysis
  -> separate contractResult and causalDisposition
```

Same-process controls should run in the same owned browser/Electron process, on the same active display and window, immediately before and after the game arm. Controls are brackets, not substitutes for game evidence. Browser and Electron are separate strata unless exact runtime/build identities and a controller-approved equivalence question are predeclared.

## 10. Exploratory and confirmatory statistics

### 10.1 Unit of inference

The independent unit is a fresh-process paired block. Individual frames are temporally correlated, cadence-quantized observations inside a block. They are descriptive data, not independent experimental replicates.

**Never bootstrap individual frames.**

### 10.2 Six-block exploratory phase

Six valid fresh-process paired blocks may be used only to:

- characterize variance and control drift;
- choose one causal arm and one scenario/lifecycle stratum;
- estimate feasible confirmatory block count;
- discover instrumentation failures or invalidity reasons.

Six blocks cannot produce `game_delta`, `no_detectable_delta`, acceptance, or a final floor ruling. Their disposition is exactly `exploratory_only`.

### 10.3 Frozen confirmatory manifest

Before confirmatory data are collected, a content-hashed manifest freezes:

- exact commit, branch, profile assignment, machine and run-profile fingerprints;
- scenario, lifecycle, runtime, viewport, settings, seed policy, duration, and coverage rule;
- arm A and arm B definitions;
- exact block count and exact within-block order vector;
- primary block-level estimand;
- exact inference and interval method;
- invalid-block replacement vector and stop conditions;
- artifact paths and hash policy.

No confirmatory result may be inspected before this manifest is sealed.

### 10.4 Default balanced-randomized confirmatory design

**Proposal:** use twelve new fresh-process paired blocks. Before any confirmatory
data are collected, uniformly sample one balanced six-`AB`/six-`BA` assignment
from the complete set of `C(12, 6) = 924` balanced assignments. The sealed
confirmatory manifest freezes the seed, generator and version, sampled assignment
vector, assignment mechanism, test statistic, effect-null inversion procedure,
invalid-block handling, and decision rule.

For each block:

```text
d_i = metric(B_i) - metric(A_i)
```

The primary estimand is the mean paired block effect in milliseconds for the predeclared metric. Report:

- all twelve `d_i` values;
- mean, median, minimum, and maximum block effect;
- a two-sided exact paired randomization p-value over all 924 balanced assignment
  vectors under the frozen assignment mechanism;
- a 95% randomization interval obtained by inverting that same exact balanced
  randomization test;
- control-before/control-after drift and invalidity reasons per block.

No efficacy stop is allowed before twelve valid blocks. If the controller chooses group-sequential monitoring instead, the look schedule and alpha-spending function must be frozen before the first block; ordinary repeated `p < 0.05` peeking is forbidden.

Exploratory blocks, rejected blocks, and confirmatory blocks are disjoint. Invalid
blocks remain retained and reported. A replacement block uses the next
pre-generated balanced assignment from the sealed manifest's replacement vector;
it is never selected after seeing an effect.

## 11. Exact future write-set proposal

This is a proposal, not an authorized lease. It deliberately reuses existing owners.

### 11.1 Required harness and contract producers

| Path | Exact future responsibility |
|---|---|
| `scripts/lib/performanceClosureContracts.mjs` | Own `profileClass` schema and assignment provenance; profile-aware budgets; duration/coverage summary; origin and computed eligibility; fixed-step/backlog distribution; comparison keys; closure validation. |
| `scripts/lib/perf-present-evidence.mjs` | Consume measured control cadence; compute delivery multiples, cadence residual validity, and floor-delivery hitches; never assign `profileClass`. |
| `scripts/probe-performance-profile.mjs` | Produce controller-assigned profile metadata, stable machine/run-profile identity, canonical target/floor rows, duration coverage, raw fixed-step evidence, and explicit migration fields for legacy 34.3/zero rules. |
| `scripts/probe-raf-control.mjs` | Produce reusable headed same-binary control primitives and cadence capability records; retain standalone diagnostic command behavior without granting acceptance. |
| `scripts/lib/releaseSoakProbe.mjs` | Produce same-process browser and Electron control brackets, lifecycle classes, origin/eligibility fields, chronology, coverage, block records, confirmatory-manifest binding, restoration, and cleanup. |
| `scripts/check-performance-attribution.mjs` | Require `profileClass`, assignment ID, experiment phase, duration, arm, and confirmatory-manifest path/hash where applicable; reject acceptance-like use without them. |
| `scripts/lib/performanceScenarioDriver.mjs` | Emit authoritative `scenarioOrigin`, `stateInjected`, lifecycle/admission details, and restoration identity for every prepared scenario. |
| `scripts/lib/releaseSoakContracts.mjs` | Validate diagnostic/injected ineligibility, capability-qualified GC/GPU absence, restoration, and artifact shape. |
| `scripts/lib/performanceFinalAcceptance.mjs` | Validate assigned target/floor contracts, reject diagnostic/injected/non-public windows, enforce identity comparability, and preserve diagnostic-cannot-waive-primary semantics. |

No `package.json` change is required for the first slice; existing commands can be invoked directly and focused tests can run with `node --test`.

### 11.2 Required focused tests

| Path | Required proof |
|---|---|
| `test/performance-profile-present-evidence.test.mjs` | Non-60-Hz cadence cases, residual validity, floor allowed multiples, raw `>32` reporting versus floor-delivery hitch, and proof that cadence cannot assign profile class. |
| `test/performance-closure-contracts.test.mjs` | Profile schemas, 33.3 migration, duration/coverage accounting, invalid/dropped counts, eligibility truth table, fixed-step distribution, maximum shed steps, and comparison-key drift. |
| `test/performance-closure-probe-contract.test.mjs` | Actual producer wiring from `probe-performance-profile.mjs` and `releaseSoakProbe.mjs`; same-process controls; identity producers; no hidden fallback to 34.3/zero floor semantics. |
| `test/performance-final-acceptance.test.mjs` | Target gate, floor gate, floor raw-`>32` non-gating, floor-delivery-hitch gating, diagnostic/injected rejection, identity drift, and migration failures. |
| `test/performance-attribution.test.mjs` | Every diagnostic/injected arm is ineligible; restoration is failure-atomic; exploratory/confirmatory manifest rules; capability-qualified absence. |
| `test/performance-scenario-driver.test.mjs` | `scenarioOrigin` and injection truth come from the real producer; restoration and lifecycle identity are exact. |

### 11.3 Conditional Phase B — spatial source attribution

Only after the stop condition `spatial_source_unresolved`:

| Path | Conditional responsibility |
|---|---|
| `src/core/perfRuntime.js` | Add bounded, opt-in per-source spatial counters and caller-owned snapshots; default-off and allocation-free when disabled. |
| `src/core/spatialHash.js` | Distinguish API calls, logical requests, candidates, scalar/batch mode, cache hits/misses, and optional source token while preserving results and ordering. |
| `src/core/registry.js` | Bind system source scope only if the controller approves it as the smallest safe owner seam; preserve update order. |
| `scripts/check-spatial-hash-contract.mjs` | Prove default-off overhead, scalar/batch semantics, source accounting, no allocation regression, and candidate/order parity. |
| `test/performance-closure-contracts.test.mjs` | Validate spatial source artifact shape and block-level rate calculations. |

Reuse [src/core/coreSystem.js](../../../src/core/coreSystem.js) unchanged: its existing end-of-step `flushPerfCounters()` remains the seam unless measured evidence proves it unusable and the controller explicitly expands the lease.

## 12. Mutex, dependency, and collision analysis

The current handoff touches only its allowed documentation path.

Future implementation requires serialized ownership:

- `browser-gpu`: all real browser/Electron controls, attribution, and route evidence;
- `package`: not requested for the first slice;
- `registry`: conditional spatial-source phase only;
- `renderer`, graphics, Blender, manifests, HUD, save-schema, input, combat, AI, Massline, tether, and worldbuilding: no direct write requested;
- program ledgers: controller/integration owner only after reviewed implementation and evidence.

The harness phase can research while protected runtime lanes are active, but it must not capture acceptance against a changing worktree. Every evidence block is bound to one exact clean commit and fails closed if the worktree changes. Browser and Electron probes are serialized; parallel GPU sessions can perturb the very floor being measured.

## 13. Determinism, single-writer, save, accessibility, and performance constraints

### Determinism

- Scenario seeds, arm order, lifecycle class, and invalid-block replacement order are frozen.
- Simulation uses existing deterministic state; instrumentation reads but does not drive gameplay.
- Diagnostic visibility/material changes are reversible measurement arms, never defaults.
- No expected golden is rewritten from this program.

### Single writers

- The registry remains the sole update-order owner.
- `perfRuntime` owns timing aggregation; probes consume snapshots rather than creating another runtime telemetry tree.
- Scene/admission metrics remain in the existing scene-metrics owner.
- Profile-class assignment belongs to the controller manifest, not runtime heuristics.

### Save integrity

- Primary performance work does not change save schema.
- Autosave-under-load retains completion, hard blocking-slice, and data-safety evidence separately from frame pacing.
- Save/load public-route evidence remains part of release soak; diagnostic injected state cannot substitute for it.

### Accessibility

- Default input reachability, reduced-motion/flash behavior, legibility, contrast, and public keyboard/mouse routes are preserved.
- Diagnostic arms may isolate VFX or materials only inside labeled non-acceptance windows and must restore exact state.

### Performance and authored quality

- No lowering `renderScale`, pixel ratio, bloom, shadows, particles, physics fidelity, asset detail, or authored visual presence to pass.
- No deletion of visuals, colliders, or world content as an attribution shortcut.
- Measurement overhead is opt-in, bounded, reported, and disabled/restored after every window.
- Optimizations, if later justified, target invisible work: allocation, cadence, batching, culling, residency, admission, query amplification, and frame pacing.

## 14. Adversarial failure modes

| Failure mode | Required response |
|---|---|
| Slow result is relabeled from target to floor | Reject evidence; profile class is controller-assigned. |
| Floor nominal two-vsync delivery is called a hitch solely because it exceeds 32 ms | Preserve raw count; gate on delivery multiple beyond the allowed floor multiple. |
| Legacy 34.3 allowance survives silently | Fail contract tests; migration must be explicit. |
| A separately launched control uses another browser/profile/display state | Incomparable; require same-process bracket. |
| Control cadence is multimodal or drifts across the block | Mark cadence invalid or block inconclusive; do not choose the most convenient mode. |
| A 15-second window receives too few valid callbacks | Fail coverage and report expected/valid/invalid/dropped counts. |
| Missing callbacks are discarded from percentile input | Keep dropped coverage visible; percentile alone cannot pass the block. |
| Six exploratory blocks look compelling | Freeze a held-out manifest and run new confirmatory blocks. |
| Frames are resampled as independent observations | Reject analysis; inference unit is the fresh-process block. |
| Confirmatory arm/order is selected after viewing results | Reject confirmatory claim. |
| Injected fleet passes a budget | Retain mechanism evidence; force ineligible. |
| `gcEvents: []` is interpreted as no GC when observer unavailable | Mark capability unavailable; no absence claim. |
| GPU timer is disjoint/pending | Preserve status; do not substitute zero GPU cost. |
| Admission continues during a warm steady window | Reject steady comparability or reclassify as cold transition before seeing the result. |
| Diagnostic variant restoration fails | Reject the block and stop further arms in that runtime. |
| Worktree changes during capture | Retain telemetry as local observation only; no acceptance or confirmatory use. |
| Browser and Electron are pooled because both use Chromium | Keep separate strata unless controller predeclares a cross-runtime question and exact identities match. |
| Spatial batch count falls while logical requests rise | Report calls, logical requests, candidates, and source rates separately. |
| Measurement clocks create the apparent regression | Run baseline with gates off/on and bound instrumentation tax before using detailed timing. |

## 15. Phased implementation plan and stop conditions

### Phase 0 — contract characterization

- Pin current 33.3-versus-34.3 and raw-`>32` differences in tests.
- Confirm exact producers and validators named in the future write set.
- Record existing comparison-key fields and missing identity fields.

**Stop:** if any repository premise differs from the exact base, return a revised plan; do not expand scope.

### Phase 1 — schemas, producers, and controls

- Add controller-assigned profile metadata and identity producers.
- Add duration/coverage accounting, origin/eligibility truth, fixed-step distributions, and same-process controls.
- Preserve restoration, cold/warm, admission, residency, GC capability, and quality contracts.

**Stop:** if the runtime cannot prove exact restoration, same-process control identity, or stable clean-worktree binding, do not run exploratory blocks.

### Phase 2 — exploratory six-block study

- Select one runtime, assigned profile, lifecycle stratum, scenario, metric, and candidate diagnostic arm.
- Run six fresh-process paired blocks.
- Report variance, drift, coverage, and exploratory effect only.

**Stop:** if controls drift, coverage repeatedly fails, identity fields are unavailable, or measurement overhead is material, repair the harness before confirmation.

### Phase 3 — held-out confirmatory study

- Seal the manifest with the exact twelve-block vector and exact inference.
- Run twelve valid fresh-process paired blocks without interim efficacy inspection.
- Publish block-level effects, exact p-value/interval, controls, and invalid-block history.

**Stop:** classify `inconclusive` if the manifest cannot be followed, replacement vector is exhausted, or comparability fails. Never improvise another test after seeing results.

### Phase 4 — controller policy migration

- Decide floor comparative raw-hitch policy.
- Review canonical 33.3 migration and final-acceptance semantics.
- Only the controller/integration owner updates shared program truth after implementation and evidence review.

### Conditional Phase B — spatial source attribution

Begin only when global spatial rates remain unexplained after per-system timing, scenario controls, and existing counters, and after registry/runtime mutex release.

**Stop:** if source attribution needs per-query allocation, changes query order/results, or creates measurable default overhead, reject the design.

## 16. Focused checks and player-route evidence

Proposed narrow checks, in order:

```text
node --test test/performance-profile-present-evidence.test.mjs
node --test test/performance-closure-contracts.test.mjs
node --test test/performance-closure-probe-contract.test.mjs
node --test test/performance-final-acceptance.test.mjs
node --test test/performance-attribution.test.mjs
node --test test/performance-scenario-driver.test.mjs
node scripts/check-perf-budget-contract.mjs
node scripts/check-performance-attribution.mjs <controller-assigned arguments>
node scripts/check-performance-final-acceptance.mjs <hash-bound evidence arguments>
```

Conditional spatial phase:

```text
node scripts/check-spatial-hash-contract.mjs
npm run check:perf:spatial-cache
```

Player-route evidence remains mandatory and separate from injected matrices:

- headed browser public route at default authored quality;
- owned Electron public route as its own runtime stratum;
- normal keyboard/mouse input, no injected state;
- current screenshots and hash-bound raw artifacts;
- save/load, admission readiness, restoration, cleanup, and zero runtime-error evidence as applicable;
- exact machine/run-profile identity and control brackets.

This planning-only handoff did not execute runtime, browser, Electron, GPU, player-route, simulation, or Node test commands. Markdown and repository-shape checks are the only claims for this commit.

## 17. Unresolved questions

1. Which exact machines are controller-assigned `target` and `floor`, and who owns reassignment authority?
2. Should floor raw `>32 ms` nonincrease remain an advisory row, a paired-regression gate, or be retired after delivery-multiple adoption?
3. What cadence residual tolerance and control-drift threshold are acceptable across 59.94, 60, 75, 90, 120, 144 Hz, VRR, remote, and virtual displays?
4. Which OS power-mode fields are mandatory versus best-effort on each supported platform?
5. Is a new browser profile required for every confirmatory block, or are cold-profile and reused-profile separate experiments?
6. Which single causal arm and primary metric should the exploratory phase nominate for the first confirmatory study?
7. What is the exact invalid-block continuation vector after the twelve frozen orders?
8. Which Electron control-page mechanism provides the same-process bracket without violating canonical launcher URL policy?
9. Which platforms expose usable GC observation, and what is the required fallback when they do not?
10. At what measured threshold does `spatial_source_unresolved` authorize conditional registry/runtime instrumentation?

## 18. Controller-ready acceptance checklist

### Identity and profile

- [ ] `profileClass` is explicitly controller-assigned and provenance-bound.
- [ ] No producer or validator infers class from measured performance.
- [ ] Machine fingerprint includes OS/build, CPU/core counts, RAM tier, and GPU identity.
- [ ] Run-profile identity includes display, browser/Electron build, profile/cache, power/profile, viewport/DPR, settings, lifecycle, commit, and worktree.
- [ ] Missing required identity fields fail closed.

### Contracts and coverage

- [ ] Target requires p95 `<=16.7 ms` and zero raw frames `>32 ms`.
- [ ] Floor requires p95 `<=33.3 ms`.
- [ ] Floor raw `>32 ms` is reported but not absolute-zero gating.
- [ ] Floor delivery hitches use stable control-derived multiples beyond the allowed floor multiple.
- [ ] Diagnostic is never acceptance evidence.
- [ ] Legacy 34.3/zero floor debt is explicitly migrated and tested.
- [ ] Every window is at least 15 seconds.
- [ ] Expected callbacks/intervals, observed, valid, invalid, dropped, and coverage ratio are reported.
- [ ] Coverage is at least 90% at the assigned allowed period.

### Evidence origin and lifecycle

- [ ] Every window has `evidenceKind`, `scenarioOrigin`, injection truth, and computed eligibility.
- [ ] Every injected or diagnostic arm is ineligible.
- [ ] Public-route evidence is normal input, default quality, and non-injected.
- [ ] Cold process/profile/route, warm assets, and warm revisit are separate strata.
- [ ] Admission and residency endpoints are comparable.
- [ ] GC and GPU absence are capability-qualified.
- [ ] Variant, scenario, settings, measurement gates, and runtime resources restore exactly.

### Fixed-step and statistics

- [ ] Full `stepsThisFrame` distribution is retained.
- [ ] Multi-step frames, backlog-shedding frames, total shed steps, and maximum shed steps are retained.
- [ ] Six blocks are labeled exploratory only.
- [ ] Confirmatory blocks are fresh and held out.
- [ ] Exact arm definitions, twelve-block order, sign-flip test, interval, and replacement vector are sealed before data.
- [ ] No individual-frame bootstrap or frame-level pseudoreplication is used.
- [ ] Contract result and causal disposition remain separate.

### Quality and ownership

- [ ] No authored visual, quality, physics, accessibility, or content reduction is used as a fix.
- [ ] Existing harness, route, scene-metrics, registry, and telemetry owners are extended rather than duplicated.
- [ ] Protected mutexes are released before any conditional runtime work.
- [ ] Program ledgers remain controller-owned.
- [ ] Exact commit, artifacts, hashes, checks, route evidence, and unresolved failures are reported without rounding up status.

## 19. External primary-source anchors

These sources support measurement semantics; repository contracts remain the decision authority.

- [WHATWG HTML — animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames): rAF scheduling and timestamps.
- [W3C Performance Timeline](https://www.w3.org/TR/performance-timeline/): monotonic performance entries and observer model.
- [W3C Long Tasks](https://www.w3.org/TR/longtasks-1/): long-task observation and capability limits.
- [Khronos EXT_disjoint_timer_query_webgl2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/): asynchronous GPU timing and disjoint invalidation.
- [Electron `screen`](https://www.electronjs.org/docs/latest/api/screen) and [Display](https://www.electronjs.org/docs/latest/api/structures/display): display identity, scale, bounds, and frequency fields where exposed.
- [Chrome DevTools Protocol Browser domain](https://chromedevtools.github.io/devtools-protocol/tot/Browser/) and [SystemInfo domain](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/): browser revision/command line and GPU/process information.
- [Kalibera and Jones, “Rigorous Benchmarking in Reasonable Time”](https://kar.kent.ac.uk/33611/): hierarchical variation and replication at the process/run level.

## 20. Historical receipt

```yaml
taskId: SF-PORT-07
state: planning_complete
claimCeiling: planning_complete
baseCommit: 8f1c630f5ebf26f209052b8164f3cdf024ffd06f
resultBranch: agent/chatgpt-performance-attribution-20260723
resultCommit: <bound by the amended commit and ZIP manifest>
changedFiles:
  - docs/handoffs/chatgpt-portfolio-20260723/FLOOR_AWARE_PERFORMANCE_ATTRIBUTION.md
profileContract:
  assignedClasses: [target, floor, diagnostic]
  target:
    p95MsMax: 16.7
    rawFramesAbove32Max: 0
  floor:
    p95MsMax: 33.3
    rawFramesAbove32: reported_nonzero_nongating
    hitchGate: delivery_multiple_beyond_allowed_floor_multiple
  diagnostic:
    acceptanceEligible: false
coverage:
  minimumDurationMs: 15000
  minimumExpectedCallbackCoverage: 0.90
statistics:
  exploratoryPairedBlocks: 6
  exploratoryOnly: true
  confirmatoryPairedBlocks: 12
  frameBootstrapForbidden: true
runtimeStatus: not_implemented
focusedChecksStatus: not_run
playerRouteStatus: not_run
integrationStatus: not_integrated
```
