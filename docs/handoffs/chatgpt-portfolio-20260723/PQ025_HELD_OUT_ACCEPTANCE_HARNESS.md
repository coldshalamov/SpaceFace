# PQ-025 Held-Out Gold Corridor Acceptance Harness

> **NON-AUTHORITATIVE · PLANNING-ONLY · NOT INTEGRATED**
>
> **Task:** SF-PORT-06 — PQ-025 held-out Gold Corridor acceptance harness  
> **Audit base:** `codex/delegation-base-20260723` at exact commit `8f1c630f5ebf26f209052b8164f3cdf024ffd06f`  
> **Requested result branch:** `agent/chatgpt-pq025-acceptance-20260723`  
> **Allowed historical output:** `docs/handoffs/chatgpt-portfolio-20260723/PQ025_HELD_OUT_ACCEPTANCE_HARNESS.md`  
> **Receipt ceiling:** `returned/planning_complete` only

This is a historical planning, research, and audit handoff. It does not change program state, grant a lease, authorize feature work, or establish runtime acceptance. Per the supplied controller statement—and without adding any further status claim—**PQ-017 is in progress and not yet integrated**.

## 1. Claim discipline and evidence anchors

Every repository statement below is labeled:

- **VERIFIED** — observed at the exact base revision and tied to a path, symbol, field, fixture, or check.
- **INFERENCE** — a conclusion drawn from verified evidence, not a repository-state claim.
- **PROPOSAL** — future acceptance design only.
- **UNKNOWN** — not established at the exact base revision.

| ID | Exact-base evidence |
|---|---|
| V01 | [CANONICAL_BUILD_MAP.md](../../../CANONICAL_BUILD_MAP.md): authority order, state vocabulary, evidence discipline, and mutex ownership. |
| V02 | [AGENTS.md](../../../AGENTS.md): fixed-step simulation, single-writer ownership, Browser/Electron One Game Path, accessibility, and quality-preserving performance rules. |
| V03 | [design/program/NOW.md](../../../design/program/NOW.md): volatile lease-board role; this report does not use its snapshot to override the supplied concurrency constraints. |
| V04 | [design/program/roadmap/program-queue.json](../../../design/program/roadmap/program-queue.json): `PQ-025`, dependencies `PQ-019`–`PQ-024`, mutexes, checks, and evidence classes. |
| V05 | [design/program/roadmap/00_EXECUTION_PROTOCOL.md](../../../design/program/roadmap/00_EXECUTION_PROTOCOL.md): exact-revision receipts, proof classes, confirmation labels, and player-visible evidence. |
| V06 | [design/program/roadmap/02_GOLD_CORRIDOR.md](../../../design/program/roadmap/02_GOLD_CORRIDOR.md): G01/G17/G18/G19/G20 intent, no-injection rule, held-out route, and Browser/Electron serialization. |
| V07 | [docs/Spec/47A_SLICE_CONTRACT.md](../../../docs/Spec/47A_SLICE_CONTRACT.md): deterministic replay, save/retry, Massline, branching, timing, accessibility, and presentation constraints. |
| V08 | [scripts/lib/goldCorridorPublicPilot.mjs](../../../scripts/lib/goldCorridorPublicPilot.mjs): `GOLD_CORRIDOR_MILESTONES`, `GOLD_CORRIDOR_ADVISORY_MILESTONES`, `buildPilotReceipt`, `buildRouteIdentity`, `validatePilotSources`, and `runGoldCorridorPublicPilot`. |
| V09 | [scripts/check-gold-corridor-public-pilot.mjs](../../../scripts/check-gold-corridor-public-pilot.mjs): headed Browser driver, canonical server, fixed viewport, receipt publication, and cleanup. |
| V10 | [test/gold-corridor-public-pilot-contract.test.mjs](../../../test/gold-corridor-public-pilot-contract.test.mjs): milestone ordering, no-injection, cleanup, identity, and receipt-contract tests. |
| V11 | [src/balance/careerCohorts.js](../../../src/balance/careerCohorts.js), [scripts/check-m3-career-cohorts.mjs](../../../scripts/check-m3-career-cohorts.mjs), and [test/fixtures/m3-career-cohorts/cohort-report.v2.json](../../../test/fixtures/m3-career-cohorts/cohort-report.v2.json): career×horizon runs, fixed public seeds, deterministic guard, live/adapter boundaries, save round-trip, and exact audited progression rows. |
| V12 | [scripts/check-career-earnings-benchmark.mjs](../../../scripts/check-career-earnings-benchmark.mjs): deterministic 30/90-minute career earnings, conservation, risk, research, and progression constraints. |
| V13 | [scripts/lib/professionalTravelPublicRoute.mjs](../../../scripts/lib/professionalTravelPublicRoute.mjs) and [scripts/check-professional-travel-public-route-electron.mjs](../../../scripts/check-professional-travel-public-route-electron.mjs): shared public travel, physical gate events, cold Continue, isolated Electron profile, source fingerprint, process health, and cleanup. |
| V14 | [scripts/lib/releaseSoakReceipts.mjs](../../../scripts/lib/releaseSoakReceipts.mjs): long-session phases, state hashes, save/reload equivalence, high-water sampling, and monotonic-growth detection. |
| V15 | [src/ui/screens/newGame.js](../../../src/ui/screens/newGame.js): public `#sf-ng-seed`, `parseUniverseSeed`, and `game:new` propagation. |
| V16 | [design/PERF_BUDGET.md](../../../design/PERF_BUDGET.md): target/floor budgets, p95/p99/hitches, fixed-step catch-up metrics, quality-preserving doctrine, residency expectations, and save blocking limits. |
| V17 | [scripts/AGENTS.md](../../../scripts/AGENTS.md), [docs/AGENTS.md](../../AGENTS.md), and [test/AGENTS.md](../../../test/AGENTS.md): narrow checks, public-behavior tests, seeded time, durable evidence, and Markdown-link verification. |

## 2. Executive decision

**PROPOSAL — decision:** PQ-025 should be an observational, held-out acceptance compositor over existing owners. It should not become a gameplay bot, alternate simulator, second save model, parallel event system, new Massline implementation, or permission to add features.

The gate should reuse:

1. V08–V10 for G01 launch, no-injection, milestone, receipt, and cleanup primitives.
2. V11–V12 for deterministic career viability and economic/conservation support.
3. V13 for shared Browser/Electron public travel, cold Continue, isolation, process health, and source stability.
4. V14 and V16 for long-session, frame-time, catch-up, residency, and save-blocking evidence.
5. Existing owner receipts for economy, cargo, missions, ships/equipment, combat, world/jump, Massline/tether, save, and settings.

The acceptance layer may normalize owner evidence into a common receipt, but it must never write gameplay state or manufacture a missing owner fact. A red cell is a defect report routed to the relevant owner, not authorization for the acceptance branch to patch protected systems.

**VERIFIED (V04):** `PQ-025.dependsOn` names `PQ-019` through `PQ-024`. Final qualification therefore fails closed until all six dependencies have integrated receipts at the exact candidate revision. This report does not inspect uncommitted candidates and does not predict their eventual symbols or event names.

## 3. Current-state inventory

### 3.1 Existing public-pilot harness

**VERIFIED (V08–V10):** the public pilot covers title, New Game, start, undock, objective, career, map, travel, dock, service, save, Continue, and teardown. `validatePilotSources` rejects direct mode/sector/credit writes, emitted gameplay transitions, synthetic DOM events, debug routes, and teleport/fake helpers. The Browser driver uses a canonical server, fixed viewport, headed browser by default, and owned cleanup.

**VERIFIED limitation (V08–V10):** `career-selected` is advisory rather than required; `buildRouteIdentity` records runtime kind but not a 30/90-minute horizon; the observer uses a bounded event window; and the current evidence directory is diagnosis-oriented rather than an append-only multi-attempt archive.

**INFERENCE:** the public pilot is a strong G01 diagnostic spine, but it does not by itself prove held-out career viability, native 30/90-minute play, success plus failure/recovery variants, authoritative G18 acquisition, successful Massline attachment, Electron parity, accessibility, long-run performance, or human judgment.

### 3.2 Deterministic career and progression evidence

**VERIFIED (V11–V12):** the repository has deterministic career×horizon support, blocks `Math.random` and wall-clock use in the simulation path, labels combat/mining/travel adapters, uses live economy/cargo/ship/mission authorities where stated, applies conservation and career-specific bands, and includes a save serialize/restore slice. `finalizeLoadedGame` is not exercised by the cohort gate.

**VERIFIED correction (V11):** the exact audited 90-minute fixture rows do **not** prove role-hull acquisition:

- Hauler remains `ship_kestrel`, `phase:"starter"`, `purchases:[]`.
- Hunter remains `ship_kestrel`, `phase:"researched"`, `purchases:[]`; it has `tech_combat_basics`, ends at `25,586 cr`, and records `capital_for_wasp` because Wasp costs `28,000 cr`.
- Prospector remains `ship_kestrel`, `phase:"starter"`, `purchases:[]`.
- `runProspector` treats Beam M as research-gated, and the cohort assertion rejects a 90-minute claim that it was acquired while that gate remains.

**INFERENCE:** these fixtures are useful calibration and economic evidence, but none satisfies G18. Research, a planned role hull, an engineering preview, or an affordability message is not a legal purchase/fit/capability change through Continue.

### 3.3 Browser/Electron, save, performance, and media

**VERIFIED (V13):** Browser and Electron can share a public travel core that emits physical gate/jump evidence, performs save and cold Continue, uses a canonical root, and avoids injected transitions. The Electron driver adds isolated user data, process-health checks, source-fingerprint stability, and owned teardown.

**VERIFIED (V14, V16):** the repository already defines long-session high-water evidence, save/reload equivalence, p95/p99/hitch requirements, fixed-step multi-step/backlog behavior, target `16.7 ms`, floor `33.3 ms`, quality-preserving constraints, and a `12 ms` hard save-blocking observation limit.

**UNKNOWN:** fresh 30/90-minute Browser/Electron recordings, run receipts, GPU/profile identities, and current media for the exact base commit were not established by the inspected Git history. Source declarations and old screenshots cannot satisfy PQ-025.

## 4. Architecture, event flow, and data flow

### 4.1 Capability separation

**PROPOSAL:** use three security domains.

- **Actor:** human or deterministic public-surface policy. It may use visible UI, accessibility roles/names, keyboard, pointer, pixels, and the public seed field. It may not consult hidden state, internal IDs, owner events, or diagnostics when choosing actions.
- **Observer:** read-only collection of approved owner events, canonical projections, diagnostics, save receipts, errors, process health, focus/visibility state, monotonic time, and `timeScale`. It may not emit events, call mutating owner methods, or expose hidden telemetry to the actor.
- **Judge:** validates schemas, immutability, matrix completeness, deterministic hashes, parity, media, performance, accessibility, and human forms. It may not discard an inconvenient attempt, relabel a scenario after observation, or convert `unknown` to pass.

### 4.2 Proposed flow

```text
controller salt commitment + candidate/dependency freeze
                           |
                           v
             qualification manifest + mutex lease
                           |
             +-------------+-------------+
             |                           |
             v                           v
 deterministic support suite      native live-session matrix
 fixed + held-out seeds           Browser / Electron adapters
 repeat + reload split            same-seed parity pairs
             |                           |
             +-------------+-------------+
                           v
 read-only owner evidence -> semantic normalizer -> append-only run receipt
                           |
                           v
 performance + accessibility + media + player/reviewer judgment
                           |
                           v
 immutable aggregate receipt -> controller decision
```

**PROPOSAL:** semantic IDs are acceptance vocabulary only. They are not new game events. Each normalized outcome must retain raw owner references, tick/sim identity, media references, path variant, and `verified|unknown` confidence.

## 5. Semantic receipt and immutable evidence contract

### 5.1 Per-attempt receipt

**PROPOSAL — schema:** `spaceface.goldCorridorAcceptance.run.v2`.

```json
{
  "schemaVersion": "spaceface.goldCorridorAcceptance.run.v2",
  "runId": "<content-addressed attempt id>",
  "build": {
    "commit": "<40-hex>",
    "dependencyReceiptHashes": {},
    "sourceFingerprintStart": "<sha256>",
    "sourceFingerprintEnd": "<sha256>"
  },
  "assignment": {
    "career": "hauler|hunter|prospector",
    "horizonMin": 30,
    "scenarioClass": "success|failure-recovery",
    "expectedSemanticOutcome": "<frozen id>",
    "cohortId": "<opaque id>",
    "parityPairId": "<career+horizon+scenario+cohort>",
    "runtimeKind": "browser|electron",
    "attemptOrdinal": 1,
    "seedClass": "fixed-calibration|held-out",
    "seed": 1,
    "seedDerivationVersion": "pq025-heldout-v2-runtime-independent",
    "seedRuntimeIndependent": true,
    "accessibilityProfile": "<frozen profile>",
    "playerId": "<pseudonymous>"
  },
  "qualification": {
    "cleanExactRevision": true,
    "dependenciesExact": true,
    "hardwareGpu": true,
    "sourceStable": true,
    "scenarioQualified": true,
    "nativeTimeQualified": true,
    "failures": []
  },
  "timeline": {
    "clockKind": "monotonic",
    "totalMonotonicWallMs": 0,
    "requiredFocusedMonotonicWallMs": 1800000,
    "qualifiedFocusedMonotonicWallMs": 0,
    "pausedMs": 0,
    "unfocusedMs": 0,
    "hiddenOrLoadingMs": 0,
    "timeScaleRequired": 1,
    "timeScaleSampleCount": 0,
    "timeScaleSamplesSha256": "<sha256>",
    "timeScaleObservedMin": 1,
    "timeScaleObservedMax": 1,
    "timeScaleTraceGapMaxMs": 0,
    "timeCompressionDetected": false,
    "simStartTick": 0,
    "simEndTick": 0,
    "simFixedStepMs": 16.6666666667,
    "simTimeDeltaMs": 0,
    "simEligibleFocusedWallMs": 0,
    "simReconciliationErrorMs": 0,
    "simReconciled": true
  },
  "outcomes": {
    "careerLoops": [],
    "corridor": {},
    "economy": {},
    "progressionPurchaseFitCapability": {},
    "combat": {},
    "adverseState": {},
    "recovery": {},
    "masslineOpportunity": {},
    "masslineAuthoritativeAttach": {},
    "nextActionAvailable": {}
  },
  "save": {
    "checkpoints": [],
    "coldContinuePassed": false,
    "duplicateOrRollbackDetected": false
  },
  "performance": {
    "captureId": "<unique per attempt>",
    "traceSha256": "<sha256>",
    "profileClass": "target|floor",
    "hardwareProfileId": "<stable normalized id>",
    "executionProfileId": "<stable runtime/settings/viewport id>",
    "refreshPeriodMs": 0,
    "captureDurationMs": 0,
    "frameSampleCount": 0,
    "segments": [
      {
        "routeClass": "launch-warmup|sparse-flight|station-ui|travel-jump|career-work|combat-massline|save-continue|recovery|crowded-stress",
        "durationMs": 0,
        "sampleCount": 0,
        "frameMs": { "p50": 0, "p95": 0, "p99": 0, "max": 0 },
        "framesOver32Ms": 0,
        "missedVsyncCount": 0,
        "missedVsyncRate": 0,
        "multiStepFrameCount": 0,
        "maxSimStepsPerFrame": 0,
        "shedBacklogFrameCount": 0,
        "phaseP95Ms": {},
        "residency": { "baseline": {}, "peak": {}, "end": {}, "returnedTowardBaseline": null }
      }
    ],
    "gate": {
      "profileP95ThresholdMs": 16.7,
      "framesOver32Policy": "must-be-zero|diagnostic-only",
      "captureReuseDetected": false
    },
    "saveBlocking": {}
  },
  "accessibility": {},
  "media": [],
  "humanJudgment": {},
  "failure": { "primaryClass": null, "contributingClasses": [], "owner": null },
  "antiGaming": {
    "runtimeExcludedFromSeedDerivation": true,
    "parityPairSeedsEqual": true,
    "scenarioFrozenBeforeRun": true,
    "allAttemptsRetained": true,
    "bestOfN": false,
    "stateInjectionDetected": false,
    "timeCompressionDetected": false,
    "performanceCaptureReused": false
  },
  "verdict": "pass|fail|invalid|blocked"
}
```

Runtime is metadata only. It may never influence the seed. UTC timestamps may be retained for human orientation, but horizon qualification comes only from the monotonic trace.

### 5.2 Immutable attempt ledger

**PROPOSAL:** every launched attempt—pass, product fail, harness fail, environment invalid, abort, and replacement—receives an append-only directory and content hash before any rerun. No best-of-N, overwrite, or “clean replacement” is allowed.

The aggregate receipt must bind:

- candidate and dependency hashes;
- salt commitment/reveal and derivation version;
- frozen matrix, run order, players, profiles, and expected outcomes;
- every attempt hash in launch order;
- deterministic repeat/reload hashes;
- same-seed Browser/Electron comparisons;
- save checkpoints, media hashes, performance traces, player forms, reviewer forms, and final classifications.

## 6. Fixed and held-out seeds, cohorts, and schedules

### 6.1 Fixed calibration set

**PROPOSAL:** keep V11–V12 source-visible seeds as calibration only. They catch deterministic drift and economic regressions but are not blind and cannot be the sole acceptance set.

### 6.2 Runtime-independent held-out derivation

Before candidate freeze, the controller generates secret salt `S` and publishes only:

```text
commitment = SHA256("spaceface:pq025:seed-salt:v2\0" || S)
```

After the exact candidate commit `C`, dependency hashes, thresholds, matrix, run order, profiles, players, and scenario policies are frozen, reveal `S` and derive:

```text
seed32 = low_unsigned_32_bits(
  SHA256(
    "spaceface:pq025:heldout:v2\0" ||
    C || "\0" ||
    career || "\0" ||
    horizonMin || "\0" ||
    scenarioClass || "\0" ||
    cohortIndex || "\0" ||
    S
  )
)
seed32 = seed32 == 0 ? 1 : seed32
```

**PROPOSAL — hard rules:** `runtimeKind`, hardware/profile, player, attempt ordinal, and observed outcome are excluded. Browser and Electron members of a parity pair therefore use the **same exact seed**. A mismatched pair is invalid before product comparison. The live actor enters the decimal seed through V15’s public `#sf-ng-seed` field.

### 6.3 Deterministic held-out suite

**PROPOSAL — minimum:** for each career×horizon stratum, preassign six seeds to `success` and six to `failure-recovery`.

- `3 careers × 2 horizons × 2 scenario classes × 6 seeds = 72 semantic cells`.
- Each cell runs uninterrupted, exact repeat, and a fixed 50% save/reload split.
- Total deterministic executions: `216`.

Every cell has a frozen `expectedSemanticOutcome`. A scenario mismatch is a failed cell; the observed result cannot rewrite the assignment. If a stratum lands within 10% of a hard economic boundary, exposes a new bottleneck class, or depends on an adapter-sensitive result, add six more prederived seeds to that exact stratum without erasing the original cells.

### 6.4 Native live-session matrix

| Career | Horizon | `scenarioClass` | Frozen `expectedSemanticOutcome` | Browser | Electron |
|---|---:|---|---|---:|---:|
| Hauler | 30 min | `success` | `hauler.loop-settled-and-continued` | 1 | 1 paired |
| Hauler | 30 min | `failure-recovery` | `hauler.adverse-economy-or-cargo-state-recovered-and-continued` | 1 | 1 paired |
| Hauler | 90 min | `success` | `hauler.corridor-progression-massline-attached-and-continued` | 1 | 1 paired |
| Hauler | 90 min | `failure-recovery` | `hauler.adverse-state-recovered-route-resumed-and-continued` | 1 | 1 paired |
| Hunter | 30 min | `success` | `hunter.contract-resolved-and-continued` | 1 | 1 paired |
| Hunter | 30 min | `failure-recovery` | `hunter.combat-loss-or-damage-recovered-and-continued` | 1 | 1 paired |
| Hunter | 90 min | `success` | `hunter.corridor-progression-massline-attached-and-continued` | 1 | 1 paired |
| Hunter | 90 min | `failure-recovery` | `hunter.adverse-state-recovered-route-resumed-and-continued` | 1 | 1 paired |
| Prospector | 30 min | `success` | `prospector.extraction-settled-and-continued` | 1 | 1 paired |
| Prospector | 30 min | `failure-recovery` | `prospector.depletion-cargo-or-damage-state-recovered-and-continued` | 1 | 1 paired |
| Prospector | 90 min | `success` | `prospector.corridor-progression-massline-attached-and-continued` | 1 | 1 paired |
| Prospector | 90 min | `failure-recovery` | `prospector.adverse-state-recovered-route-resumed-and-continued` | 1 | 1 paired |

That is 24 primary live sessions: 12 native 30-minute sessions and 12 native 90-minute sessions. Each row is a same-seed Browser/Electron pair. Failure/recovery cells are additional evidence and cannot substitute for a failed success cell.

Use at least three players. No player should run both runtimes in the same parity pair or see the paired receipt first. Counterbalance accessibility profiles across careers, horizons, runtimes, and scenario classes.

## 7. Native duration, time-scale integrity, and sim reconciliation

**PROPOSAL — hard qualification for every live attempt:**

- 30-minute cells require `qualifiedFocusedMonotonicWallMs >= 1,800,000`.
- 90-minute cells require `qualifiedFocusedMonotonicWallMs >= 5,400,000`.
- `timeScale` must remain exactly numeric `1` throughout every qualifying interval.
- Sample `timeScale` at start/end, every pause/focus/visibility/loading transition, and a fixed cadence no slower than one second; sample each fixed tick when an existing read seam permits it. Hash the append-only trace.
- Any non-`1` sample, missing transition sample, cadence gap, unknown interval, harness write to `timeScale`, accelerated/catch-up script, or compressed schedule invalidates the attempt.
- Exclude pause, unfocus, hidden-tab, loading, title, teardown, and other non-playable intervals from qualified wall duration.
- Focused idling cannot pass: semantic activity buckets and required owner outcomes remain mandatory.
- Reconcile authoritative simulation time as `(simEndTick - simStartTick) × fixedStepMs` against sim-eligible focused wall intervals. Freeze tolerance before reveal at `max(2 × fixedStepMs, 0.5% of simEligibleFocusedWallMs)`. Larger unexplained error, unknown clock classification, or unexplained backlog shedding fails qualification.

The deterministic support suite may execute faster than wall time, but it can never satisfy the native live-session duration gate.

## 8. Path-independent success, G18, and Massline

### 8.1 Common 30-minute criteria

**PROPOSAL:** every 30-minute cell must prove:

- held-out seed entered through public New Game;
- requested career visibly confirmed, not merely passed as a CLI label;
- frozen scenario and expected outcome matched;
- native focused monotonic duration under §7;
- at least one career-authentic loop through existing owners;
- at least one physical travel/navigation decision and legitimate economic consequence;
- no dead-end state without a visible viable next action;
- cold save/Continue and one meaningful post-Continue action;
- no duplicated reward, cargo, mission, progression, sector, or recovery state;
- current media, player form, reviewer form, no page/process/cleanup error.

`success` requires the successful career outcome to settle and remain actionable through Continue. `failure-recovery` requires an authoritative adverse-state receipt, public recovery, resumed career work, and persistence through Continue. A trivial repair tap, menu reset, or state injection does not qualify.

Path independence means the gate accepts different legitimate stations, contracts, commodities, targets, and tactical choices when the same authoritative semantic outcome is proven. It does not accept a DOM label without owner evidence.

### 8.2 Common 90-minute criteria and corrected G18 diagnosis

**PROPOSAL:** every 90-minute cell must satisfy the 30-minute criteria and additionally prove:

- native `5,400,000 ms` focused monotonic duration at exact `timeScale === 1`;
- public Helios–Ceres–Tethys traversal bound to world/jump authority;
- sustained career work, trade/service, combat, and a meaningful recovery path;
- at least three save/Continue checkpoints;
- sparse, normal, crowded/stress, save, and recovery performance segments;
- no monotonic entity/listener/deferred/resource growth or late-session degradation;
- same-seed Browser/Electron semantic parity;
- **an actual legal role-authentic purchase, legal fit/activation, measurable capability change, and post-Continue persistence for that career**.

A research unlock, research points, planned hull, preview, affordability prompt, or unfitted owned item does not satisfy G18. Required evidence is an owner purchase receipt, charge/ownership consistency, legal fit or activation receipt, before/after role-relevant capability projection, and post-Continue digest.

**VERIFIED (V11):** the base 90-minute Hunter only researched Combat Basics and lacked capital for Wasp; Hauler and Prospector also purchased no role hull; Prospector Beam M remained research-gated. The acceptance methodology must diagnose those facts honestly rather than treating a target hull or research state as completed progression.

### 8.3 Successful Massline attachment

**PROPOSAL — hard success-cell gate:** every scheduled 90-minute `success` cell must contain a **successful authoritative Massline attach receipt** from the integrated owner. A visible opportunity, valid target, affordance, and public attempt are supporting evidence only and are insufficient.

The receipt bundle should bind public attach input, owner identity, source event/symbol, tick, target identity, resulting attach/tether state, first steering response, first tether use, first hostile shot, branch/world-fact result, accessibility cues, media, and save persistence when the owner contract persists attachment state.

If the candidate exposes no stable authoritative attach receipt, qualification fails before held-out runs and the controller requests a narrow owner-owned observation seam. The acceptance branch may not add an acceptance-only Massline event, infer attachment from pixels alone, or downgrade to opportunity plus attempt.

A deterministic 47A fixture supports replay/branch proof but cannot replace live successful attachment. Live attachment cannot replace deterministic save/branch proof.

## 9. Save, Continue, and recovery checkpoints

**PROPOSAL — 30-minute schedule:**

- C0: identity immediately after New Game.
- C1: after first completed career loop, targeted near minutes 12–18.
- cold reload to title → Continue.
- C2: one post-Continue meaningful action plus semantic digest.

**PROPOSAL — 90-minute schedule:**

- C0: New Game identity.
- C1: after first career loop.
- C2a: immediately before legal purchase/fit.
- C2b: immediately after purchase, fit/activation, and capability delta.
- C3: after combat/adverse-state recovery.
- C4: final corridor sector or minute 85, whichever comes first.
- final cold reload → Continue → verify purchased/fitted capability and perform one meaningful action.

Across the matrix, include Browser-created save opened by Electron and Electron-created save opened by Browser, each from an isolated copied save.

The semantic digest should reuse existing serializers/snapshot utilities and include seed, tick/sim time, sector, readiness, credits/transactions, cargo, mission state, career state, purchase/ownership/fit/capability, research, faction facts, damage/recovery, branch/world facts, and Massline persistence only when the current save owner serializes it. Missing required owner evidence is `unknown`, not approximate success.

Detect duplicate rewards, cargo duplication/loss, charged-but-unowned purchase, owned-but-illegal fit, missing capability delta, mission rollback, sector rollback, branch rollback, inconsistent recovery, settings loss, or Continue opening the wrong slot/seed.

## 10. Browser/Electron parity, accessibility, performance, and human judgment

### 10.1 Runtime parity

**PROPOSAL:** parity is semantic, not pixel identity. A pair must share candidate commit, runtime-independent seed, parityPairId, scenario, expected outcome, difficulty, default quality, viewport class, accessibility profile, canonical root, and checkpoint projection. Each runtime independently passes native duration, save, accessibility, performance, process health, source stability, and cleanup. Different seeds, missing attempts, capture reuse, or scenario relabeling invalidates the pair.

### 10.2 Accessibility

**PROPOSAL:** run focused UI accessibility and contrast checks, then require live evidence for keyboard reachability, stable names/roles, sane focus return, no trap, non-color critical cues, non-audio combat/Massline/save/failure/recovery cues, reduced-motion/reduced-flash preservation, constrained viewport/UI scale, and player-visible readability. Static focusability cannot override a human finding that a critical action is practically undiscoverable.

### 10.3 Explicit performance schema and gates

**PROPOSAL:** each attempt owns one unique headed hardware-GPU capture and declares:

- `profileClass: target|floor`;
- stable `hardwareProfileId` covering normalized CPU, GPU, driver, RAM, OS, display/refresh, and power profile;
- stable `executionProfileId` covering runtime/version, viewport, device scale, default quality, accessibility profile, and capture method;
- candidate, run, runtime, scenario, parity-pair, unique `captureId`, and raw `traceSha256`;
- route class, duration, and sample count for each segment;
- p50/p95/p99/max frame time;
- frames over `32 ms`, missed-vsync count/rate, multi-step-frame count, max sim steps/frame, and backlog-shed count;
- sim/render/VFX/UI phase p95s where available;
- residency baseline/peak/end for geometries, textures, programs, and available GPU-resident-byte probes;
- draw calls, triangles, entities, particles/sprites/lights, capture overhead, recorder mode, and save blocking metrics.

Hard bars are profile-specific and non-interchangeable:

- **Target only:** p95 `<= 16.7 ms`; scored target segments require exactly zero frames over `32 ms`.
- **Floor only:** p95 `<= 33.3 ms`; frames over `32 ms` remain mandatory diagnostics but are **not** zero-gated. A floor receipt with `framesOver32Policy:"must-be-zero"` is schema-invalid.
- A target capture cannot pass under the floor threshold; a floor capture cannot be labeled target after observation.
- p99, max, missed-vsync, multi-step, backlog, and residency are mandatory even when p95 passes.
- No quality reduction may be used to pass. Save raw blocking maximum remains `<= 12 ms` under V16.

`captureId` must bind candidate, run, runtime, hardware/execution profiles, monotonic start, and trace hash. Reusing one capture or raw trace across runtimes, profiles, scenarios, or attempts invalidates every affected receipt. One raw trace may be segmented only within its owning attempt with non-overlapping intervals.

### 10.4 Human judgment

**PROPOSAL:** automated proof decides determinism, authorities, timings, hashes, save integrity, parity, performance, and matrix completeness. Human player plus independent reviewer decide discoverability, role identity, fairness, readability, cue clarity, recovery comprehensibility, perceived continuity, and whether the route feels coherent rather than merely executable. Critical rubric failures are acceptance failures even when automation is green.

## 11. Failure attribution, attempt retention, and anti-gaming

### 11.1 Primary failure classes

| Class | Meaning and treatment |
|---|---|
| `QUALIFICATION` | Wrong/dirty revision, dependency mismatch, runtime-dependent/mismatched seed, scenario mismatch, short/native-time failure, non-`1` timeScale, wrong profile/threshold, reused capture, quality override, missing GPU, or source drift. Invalid; retain attempt. |
| `ENVIRONMENT` | Independently evidenced OS sleep/update, recorder failure, hardware reset, or unrelated infrastructure fault. One predeclared replacement; retain both. |
| `HARNESS` | Actor/observer/normalizer/streaming/cleanup defect. Block gate; repair harness; rerun all affected cells under a new harness hash. |
| `PRODUCT_ONBOARDING` | Career/objective/action not discoverable or reachable. Product fail. |
| `PRODUCT_NAV_TRAVEL` | Map, waypoint, gate, sector, dock, or corridor failure. Product fail. |
| `PRODUCT_ECONOMY` | Dead route, conservation, settlement, affordability, or next-action failure. Product fail. |
| `PRODUCT_PROGRESSION` | Missing legal purchase, charge, ownership, fit/activation, capability delta, or Continue persistence. Research-only evidence cannot pass. |
| `PRODUCT_COMBAT_AI` | Encounter liveness, resolution, counterplay, or readability failure. Product fail. |
| `PRODUCT_MASSLINE_TETHER` | Missing owner seam, no successful authoritative attach, unreadable result, or save mismatch. Missing seam blocks qualification; otherwise product fail. |
| `PRODUCT_SAVE_RECOVERY` | Duplication, rollback, corruption, Continue, or recovery failure. Product fail. |
| `PRODUCT_A11Y` | Reachability, focus, cue, contrast, motion/flash, or legibility failure. Product fail. |
| `PRODUCT_PERF` | Profile-specific p95, target-only zero->32, p99/max, missed-vsync, multi-step, residency, save blocking, growth, or process-health failure. Product fail. |
| `PRODUCT_PARITY` | Browser/Electron semantic divergence. Product fail. |
| `HUMAN_JUDGMENT` | Critical player/reviewer rubric failure. Acceptance fail. |
| `UNKNOWN` | Evidence cannot support a valid class or owner. Hard fail; never provisional pass. |

### 11.2 Anti-gaming rules

- Commit-reveal prevents tuning to held-out seeds.
- Runtime is excluded from seed derivation; parity seeds must match exactly.
- Scenario class and expected outcome freeze before reveal and cannot be relabeled.
- Success and failure/recovery variants are both mandatory.
- Every launched attempt remains in order; no best-of-N.
- Actor cannot consult hidden telemetry; observer cannot mutate state.
- Native monotonic duration, exact hashed `timeScale === 1`, and sim reconciliation reject time compression.
- Streaming/chunk-hashed evidence prevents bounded-window erasure.
- G18 requires purchase+fit+capability+Continue, not research/preview.
- Every 90-minute success cell requires authoritative Massline attach success.
- Media and performance captures are unique, hash-bound, and cannot be reused.
- Target/floor thresholds cannot be swapped; floor cannot inherit target’s zero->32 gate.
- Unknown remains fail; averages cannot erase one hard-cell or critical-human failure.

## 12. Exact future write-set proposal

**PROPOSAL — not authorization:** reuse existing owners and add only the acceptance composition layer.

New files:

1. `scripts/lib/goldCorridorAcceptanceContracts.mjs` — schemas, runtime-independent derivation, frozen matrix, semantic validation, failure taxonomy, anti-gaming, aggregation, parity.
2. `scripts/lib/goldCorridorAcceptanceSession.mjs` — shared Browser/Electron orchestration, actor/observer separation, public seed entry, native monotonic clock, hashed timeScale trace, sim reconciliation, streaming evidence, checkpoints, media, unique performance capture.
3. `scripts/check-gold-corridor-acceptance-browser.mjs` — Browser adapter reusing canonical server, GPU identity, and cleanup patterns.
4. `scripts/check-gold-corridor-acceptance-electron.mjs` — Electron adapter reusing profile isolation, process health, source fingerprint, and teardown.
5. `scripts/check-gold-corridor-acceptance-aggregate.mjs` — immutable attempt ledger and aggregate validator.
6. `test/gold-corridor-acceptance-contract.test.mjs` — pure contract and adversarial fixtures.

Integrator-owned later, under the package mutex only after direct commands pass:

7. `package.json` — additive aliases only.

No planned changes to gameplay source, registry, save schema, renderer/HUD/assets, input, combat, AI, Massline/tether, worldbuilding, program ledgers, or existing public-pilot/travel owners. If a required fact is not observable, stop and request a narrow owner-owned read seam; do not create duplicate state or an acceptance-only gameplay event.

Generated evidence remains under ignored content-addressed roots, for example `.devshots/gold-corridor/acceptance/<commit>/<cohort>/<scenario>/<runtime>/attempt-<n>/`.

## 13. Dependencies, mutexes, collisions, and constraints

### 13.1 Dependencies and mutexes

**VERIFIED (V01, V04):** final execution depends on `PQ-019`–`PQ-024` and must respect live mutex ownership. Browser/Electron hardware-GPU evidence is serialized. Save schema, package, registry, graphics/renderer/assets/HUD, input, combat/AI, Massline/tether, worldbuilding, and shared program ledgers remain owner-controlled.

### 13.2 Collision analysis

**PROPOSAL:** likely collisions are:

- concurrent Browser/Electron sessions sharing ports, GPU, profiles, or `.devshots` paths;
- save slots or profile directories reused across attempts;
- package alias edits while another package owner is active;
- acceptance code guessing dependency event names before integration;
- bounded event buffers truncating long sessions;
- shared performance captures or stale media satisfying multiple cells;
- acceptance-owned probes drifting into renderer, save, or gameplay writers.

Mitigation: serialized leases, isolated profiles/saves/ports, content-addressed output, exact source fingerprints, streamed evidence, unique capture identity, owner seam freeze before reveal, and fail-closed unknowns.

### 13.3 Determinism, single-writer, save, accessibility, and performance

- Deterministic proof uses seeded simulation time and authoritative projections; wall-clock is forbidden in deterministic outcomes.
- Actor/observer never write `timeScale`, economy, cargo, missions, ships/equipment, combat, world, Massline/tether, recovery, or save state.
- Existing owner receipts remain the only authority for their domains.
- No new PQ-025 fields enter the save schema; compare existing canonical projections.
- Accessibility profiles and assignments freeze before reveal.
- Headless soak may prove state integrity and growth, never headed GPU frame-time acceptance.
- Quality settings cannot be lowered to pass.

## 14. Adversarial failure modes

The contract tests should reject at least:

1. `runtimeKind` included in seed derivation.
2. Browser/Electron parity pair uses different seeds.
3. scenario relabeled after observation.
4. required failure/recovery cell omitted.
5. failed/invalid attempt deleted or replaced in place.
6. hidden state used as actor oracle.
7. direct state/event/transition injection.
8. 30-minute wall duration below `1,800,000 ms`.
9. 90-minute wall duration below `5,400,000 ms`.
10. pause/unfocus/loading counted toward qualification.
11. `timeScale` differs from `1`, trace has a gap, or harness writes it.
12. sim time fails reconciliation.
13. focused idling satisfies the horizon.
14. research, planned hull, preview, or affordability prompt counted as G18.
15. purchase exists without legal fit/activation or capability delta.
16. purchase/fit disappears or duplicates through Continue.
17. Massline opportunity+attempt accepted without authoritative attach success.
18. missing attach seam treated as warning rather than qualification block.
19. target capture evaluated at `33.3 ms`.
20. floor capture zero-gated for frames over `32 ms`.
21. p99/max/missed-vsync/multi-step/residency omitted.
22. one performance trace reused across attempts/runtimes/profiles/scenarios.
23. quality reduced to pass.
24. headless throughput presented as Browser/Electron GPU evidence.
25. bounded event buffer erases early evidence.
26. stale media or old receipt reused.
27. save file existence accepted without semantic Continue proof.
28. unknown owner evidence converted to pass.

## 15. Phased implementation plan and stop conditions

### Phase 0 — authority and observability freeze

Resolve dependency receipt hashes; final owner event/projection map; role-authentic purchasable change for each career; authoritative Massline attach seam; pause/focus/playable-state/timeScale read seams; target/floor profiles; recorder overhead; players/reviewers; and artifact retention.

**Stop** if dependencies are not integrated, a career lacks a reachable legal G18 change, Massline attach has no authoritative read seam, native timing cannot be observed read-only, or a required owner is ambiguous.

### Phase 1 — pure contracts

Implement schemas, derivation, scenario matrix, immutable ledger, failure taxonomy, profile rules, capture uniqueness, and adversarial tests without launching the game.

**Stop** if runtime-dependent seeds, scenario relabeling, omitted attempts, floor zero-gating, capture reuse, research-only G18, or opportunity-only Massline can pass fixtures.

### Phase 2 — fixed calibration

Run existing launch/no-injection, career, save, travel, accessibility, GPU, performance, hitch, and soak checks on the exact candidate. Confirm the base role-hull diagnosis remains represented honestly in calibration evidence.

**Stop** on deterministic drift, conservation failure, save mismatch, source drift, or prerequisite red.

### Phase 3 — held-out deterministic suite

Reveal salt after freeze; execute 72 cells × three modes; retain all results.

**Stop** on seed mismatch, nondeterminism, projection mismatch, harness defect, or unknown owner evidence.

### Phase 4 — native 30-minute matrix

Execute 12 cells: three careers × two scenarios × two runtimes. Require native duration, scenario outcome, career loop, Continue, accessibility, media, and unique performance evidence.

**Stop immediately** for systemic qualification failure, save-corruption risk, source drift, process leak, or harness misclassification. Continue safe independent cells after isolated product failures to preserve defect distribution.

### Phase 5 — native 90-minute matrix

Execute 12 cells with corridor, actual G18 purchase/fit/capability persistence, combat, recovery, saves, long-run/performance evidence, and authoritative Massline attach in every success cell.

Use the Phase 4 stop rules, plus immediate stop for missing attach authority, progression-owner ambiguity, or runaway resource growth.

### Phase 6 — independent judgment and aggregate

Collect player/reviewer forms, adjudicate disagreements, verify media, then emit one content-addressed aggregate covering 72 deterministic cells, 24 live cells, every attempt, same-seed parity, both scenario classes, and unique captures.

## 16. Marginal-gains stop point

**PROPOSAL:** stop adding evidence when all predeclared hard cells pass, no unknown remains, critical human items pass, required current media exists, and two independent reviewers agree that another run is unlikely to change a hard decision.

Do not stop for averages, a favorable rerun after a product failure, incomplete scenario coverage, missing target/floor evidence, missing Massline attach, research-only G18, stale media, or unresolved attribution. After the hard matrix passes, allow at most one controller-approved exploratory expansion per newly observed defect class. Further runs without a new hypothesis are evidence theater, not rigor.

## 17. Focused checks and player-route evidence

### 17.1 Focused automated prerequisites

**PROPOSAL:** run direct existing checks before package aliases or held-out sessions, including the exact equivalents of:

```text
node --test test/gold-corridor-public-pilot-contract.test.mjs
node scripts/check-gold-corridor-public-pilot.mjs --career hauler --stop clean-teardown
node scripts/check-gold-corridor-public-pilot.mjs --career hunter --stop clean-teardown
node scripts/check-gold-corridor-public-pilot.mjs --career prospector --stop clean-teardown
node scripts/check-m3-career-cohorts.mjs
node scripts/check-career-earnings-benchmark.mjs --minutes 30
node scripts/check-career-earnings-benchmark.mjs --minutes 90
node scripts/check-professional-travel-public-route-electron.mjs
npm run check:ui-a11y
npm run check:wcag-contrast
npm run check:gpu-path
npm run check:perf
npm run check:hitch-budget
npm run check:release-soak
```

This packet does not claim those runtime checks were executed for the revised report; they are the proposed future gate.

### 17.2 Required player-route evidence

Every attempt needs current, hash-bound screenshots/clips or an uninterrupted recording plus observer log. The media manifest should include candidate, run, runtime, scenario, parity pair, monotonic interval, tick/sim time, viewport, profile IDs, GPU, settings, MIME/bytes/SHA-256, and semantic refs.

Required moments include title/New Game/seed, visible career confirmation, first work, first settlement/consequence, save and post-Continue state; plus for 90-minute cells: legal purchase, fit/activation, visible capability delta, combat, adverse state/recovery, Ceres, Tethys, final Continue, and successful authoritative Massline attachment for success cells.

## 18. Unresolved questions and risks

1. **Final owner map:** exact dependency-integrated symbols/events are unknown at the base revision.
2. **G18 progression:** identify a reachable legal purchase+fit+capability change for each career before reveal; fail qualification if absent.
3. **Massline seam:** identify the final authoritative successful-attach receipt; opportunity+attempt is not a fallback.
4. **Tethys predicates:** freeze exact integrated sector/station predicates and valid alternate paths.
5. **Failure/recovery policies:** define meaningful public, non-injected adverse states for each career/horizon.
6. **Native timing:** identify canonical read-only pause/focus/playable/timeScale seams and cadence.
7. **Profiles:** freeze stable target and floor hardware/execution manifests and recorder overhead.
8. **Performance thresholds:** beyond fixed profile p95 and target-only zero->32, freeze any p99/max/missed-vsync/multi-step/residency regression bars before reveal.
9. **Human roster:** name players, reviewers, adjudicator, and independence rules.
10. **Artifact retention:** choose a durable external store; ignored `.devshots` alone is not archival.
11. **Statistical scope:** 72 deterministic cells and 24 live cells are adversarial acceptance, not population reliability.
12. **Controller continuation:** decide whether isolated product failures stop the remaining safe matrix; this report recommends continuing for defect distribution unless safety, integrity, or systemic qualification is at risk.

## 19. Controller-ready acceptance checklist

### Authority and freeze

- [ ] Exact clean immutable candidate and dependency hashes.
- [ ] `PQ-019`–`PQ-024` integrated at that revision.
- [ ] Mutex leases permit serialized Browser/Electron evidence.
- [ ] Salt commitment predates freeze.
- [ ] Derivation excludes `runtimeKind`; parity seeds match exactly.
- [ ] Scenarios, expected outcomes, order, players, reviewers, profiles, and thresholds frozen.
- [ ] No protected owner modified by the acceptance branch.

### Harness and immutability

- [ ] Actor/observer capability separation.
- [ ] Public seed entry and no hidden oracle.
- [ ] No state/event/transition/timeScale injection.
- [ ] Source fingerprint stable.
- [ ] Every attempt append-only, content-addressed, retained.
- [ ] Streaming/chunk-hashed evidence prevents truncation.
- [ ] Scenario cannot be relabeled; unknown fails closed.
- [ ] Owned resources and ports close cleanly.

### Deterministic and scenario proof

- [ ] Fixed calibration passes and reports role-hull facts correctly.
- [ ] 72 held-out cells: 36 success, 36 failure/recovery.
- [ ] Uninterrupted, exact-repeat, and reload-split receipts for every cell.
- [ ] Conservation, authority, and projection hashes pass.
- [ ] No adapter presented as live player proof.

### Native time

- [ ] Every 30-minute live cell has `>= 1,800,000 ms` qualified focused monotonic wall time.
- [ ] Every 90-minute live cell has `>= 5,400,000 ms`.
- [ ] Hashed timeScale trace is exactly `1`, complete, and cadence-valid.
- [ ] Pause/unfocus/hidden/loading/non-playable time excluded.
- [ ] Tick-derived sim time reconciles within frozen tolerance.
- [ ] Activity/outcome gates prevent focused idling.

### Live route, G18, Massline, and save

- [ ] All 12 30-minute cells pass frozen success or failure/recovery outcomes.
- [ ] All 12 90-minute cells pass frozen outcomes and corridor traversal.
- [ ] Every 90-minute cell proves legal purchase, fit/activation, capability delta, and Continue persistence.
- [ ] No research, planned hull, preview, or affordability prompt counted as G18.
- [ ] Every 90-minute success cell has successful authoritative Massline attach receipt.
- [ ] Trade/service, combat, recovery, and required save checkpoints pass.
- [ ] Cross-runtime save portability proven both directions across the matrix.

### Accessibility, performance, media, and judgment

- [ ] Focused accessibility/contrast checks and live keyboard/focus/cue evidence pass.
- [ ] Every capture declares profile class, stable hardware/execution IDs, route class, duration, sample count, and unique identity.
- [ ] Target p95 `<=16.7 ms` and zero scored frames over `32 ms`.
- [ ] Floor p95 `<=33.3 ms`; over-32 frames recorded but not zero-gated.
- [ ] p99, max, missed-vsync, multi-step/backlog, phases, residency, and save-blocking evidence present.
- [ ] No capture/trace reuse, quality reduction, growth defect, or process-health failure.
- [ ] Fresh player-facing media is hash-bound to semantic evidence.
- [ ] Independent player/reviewer forms pass; disagreements adjudicated.
- [ ] Every failed, aborted, invalid, and replacement attempt remains.
- [ ] Aggregate binds all proof to one exact revision and applies the marginal-gains stop rule.

## 20. Packet receipt

```json
{
  "taskId": "SF-PORT-06",
  "title": "PQ-025 held-out Gold Corridor acceptance harness",
  "status": "returned/planning_complete",
  "authoritative": false,
  "planningOnly": true,
  "integrated": false,
  "baseCommit": "8f1c630f5ebf26f209052b8164f3cdf024ffd06f",
  "controllerCorrectionsApplied": 6,
  "seedRuntimeIndependent": true,
  "nativeFocusedWallRequired": true,
  "masslineAttachRequiredFor90mSuccess": true,
  "scenarioClasses": ["success", "failure-recovery"],
  "g18ActualPurchaseFitCapabilityRequired": true,
  "runtimeImplementationChanged": false,
  "focusedGreenClaimed": false,
  "routeAcceptedClaimed": false,
  "integrationClaimed": false,
  "allowedOutputOnly": true
}
```
