<!-- LIFETIME: STABLE -->
# ADR-0001: Deterministic gameplay lab and brokered acceptance

- **Status:** Accepted and implemented
- **Decision date:** 2026-07-24
- **Tags:** determinism, simulation, validation, evidence, broker, runtime manifest

## Context

Feature agents need fast, reproducible feedback from real gameplay code without using an expensive
Browser/Electron route as an implementation loop. Before this decision:

- headless simulation and browser registry copied different system collections;
- focused scenarios and live probes did not share one evidence vocabulary;
- expensive probes could be repeated against an unchanged failure;
- a headless green result could be described more broadly than the systems that actually ran;
- save/load, input, and runtime-profile differences were hard to localize.

The Phase 0 inventories under [`../baseline/`](../baseline/) preserve the characterization that
motivated the decision. They are historical snapshots, not current status.

## Decision

SpaceFace uses one progressively expensive validation architecture.

### 1. One authoritative system manifest

[`../../../src/runtime/authoritativeSystemManifest.js`](../../../src/runtime/authoritativeSystemManifest.js)
owns production system IDs, initialization/update order, slot markers, and Node-safety.
`createRegistry()` and authoritative runtime creation resolve from this identity instead of
maintaining independent ordered lists. Runtime profiles are explicit inputs rather than inferred
from browser presence.

Focused lab bundles remain explicit, because a small fixture should not claim full-production
coverage. The evidence layer records that limitation.

### 2. Declarative deterministic scenarios

`spaceface.simScenario.v1` scenarios declare fixed seed/ticks, world/entity fixtures, tick-indexed
input, metrics, assertions, checkpoints, and equivalence intent. The schema/compiler lives in
[`../../../src/contracts/simScenarioSchema.js`](../../../src/contracts/simScenarioSchema.js).

The public `sf lab` CLI executes real production gameplay systems under a fixed-step authoritative
runtime. It provides separate parent executors for:

- one-arm scenario assertions;
- repeat determinism;
- uninterrupted versus save/load continuation;
- Node versus supported focused Chromium parity;
- failure replay and trace collection.

Parent-owned equivalence cannot be supplied or skipped by the caller. Internal injectable runners
are non-promoting.

### 3. Evidence is derived from execution

[`../../../src/testing/lab/evidenceClass.js`](../../../src/testing/lab/evidenceClass.js) derives the
evidence class from the runtime, systems, host, and exclusions that actually executed. Authored
intent cannot upgrade a focused fixture into production evidence or detached parity into a public
route.

Checkpoint and equivalence results carry scenario/input/runtime identities and explicitly describe
their covered and omitted surfaces.

### 4. Expensive acceptance is brokered

[`../../../scripts/lib/validationBroker.mjs`](../../../scripts/lib/validationBroker.mjs) and
[`../../../scripts/validation-manifests/`](../../../scripts/validation-manifests/) own acceptance
claims for expensive Browser/Electron cells.

A broker manifest binds:

- candidate, production, harness, scenario, runtime, and manifest digests;
- required fast gates;
- a freshly executed `requiresScenario` gate when the live claim has eligible lab coverage;
- runtime/seed/profile identity;
- a one-use disk-backed claim;
- launch quota, timeout, process cleanup, and artifact root;
- the latest primary failure fingerprint.

An unchanged candidate/failure is blocked before process launch. Diagnostic runs are explicitly
non-promoting and do not consume acceptance quota.

### 5. Headless, parity, public route, and release claims remain distinct

The lab accelerates implementation and deterministic proof. It does not replace current
player-facing visual/accessibility judgment, ordinary-route reachability, matched performance, or
release qualification.

The operational evidence ladder and feature workflow live in
[`../../../docs/VALIDATION_WORKFLOW.md`](../../../docs/VALIDATION_WORKFLOW.md). Lab-local agent
instructions live in
[`../../../src/testing/lab/AGENTS.md`](../../../src/testing/lab/AGENTS.md).

## Certification boundary

- Public certifying APIs select and execute their own arms.
- Caller injection, deferred equivalence, unconsumed assertions, absent execution, or unbound
  evidence fails closed.
- A worker report is not evidence; the controller validates the exact candidate revision.
- Direct expensive probes are diagnostic unless brokered or replaced by an explicitly recorded
  equivalent one-use claim.
- Expected/golden data is never edited merely to make a changed simulation pass.

## Consequences

### Positive

- Most gameplay iteration can occur in milliseconds-to-seconds.
- System identity/order has one source of truth.
- Evidence labels state what actually ran.
- Repeated unchanged expensive failures are mechanically refused.
- Save/load and runtime divergence can be localized by tick and field.

### Costs and limits

- Scenario support, metrics, and browser parity must be extended deliberately.
- Some execution profiles may remain coverage-bounded; current limitations live in
  `src/testing/lab/KNOWN_GAPS.md`.
- Checkpoint identity is coverage-bounded rather than byte-exact state identity.
- Broker manifests add setup work to new expensive routes.
- A lab green result still needs player-route evidence for presentation/feel claims.

Current reproduced limitations and commands are maintained in
[`../../../src/testing/lab/KNOWN_GAPS.md`](../../../src/testing/lab/KNOWN_GAPS.md).

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Use Browser/Electron for every iteration | slow, expensive, and encourages unchanged retry loops |
| Maintain a separate simplified simulator | would drift from production gameplay authority |
| Let scenario labels define evidence strength | permits false production/public-route claims |
| Let probes self-authorize acceptance | makes failure-loop prevention and exact candidate binding bypassable |
| Treat final hash equality as complete continuation proof | can hide intermediate divergence |

## Implementation owners

- Runtime identity: `src/runtime/authoritativeSystemManifest.js`,
  `src/runtime/createAuthoritativeRuntime.js`
- Scenario contract: `src/contracts/simScenarioSchema.js`
- Lab runtime: `src/testing/lab/`
- Scenario fixtures: `src/testing/scenarios/`
- CLI: `scripts/sf-lab.mjs`
- Broker: `scripts/lib/validation*.mjs`, `scripts/validation-broker-cli.mjs`
- Acceptance manifests: `scripts/validation-manifests/`
- Adversarial proof: `test/lab-*.test.mjs`, `test/holistic-*.test.mjs`,
  `test/validation-broker.test.mjs`
