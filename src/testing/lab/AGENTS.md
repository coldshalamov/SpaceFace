<!-- LIFETIME: STABLE -->
# Deterministic gameplay lab agent guide

Root `AGENTS.md`, then [`../../../docs/VALIDATION_WORKFLOW.md`](../../../docs/VALIDATION_WORKFLOW.md).
This scope owns the scenario runtime, evidence classes, oracles, checkpoints, replay/equivalence
executors, and focused Chromium parity host.

Entry: `../../contracts/simScenarioSchema.js`, CLI `../../../scripts/sf-lab.mjs`, examples
`../scenarios/`, ADR `../../../design/lab/adr/0001-deterministic-gameplay-lab.md`, coverage
[`KNOWN_GAPS.md`](./KNOWN_GAPS.md).

## Certification boundary

Public certifying APIs select their own systems, execute their own arms, and evaluate their own
equivalence. Callers may not inject systems, results, skipped assertions, or seals. `*Internal` /
`nonPromoting` / `internal-test` are not acceptance evidence. Multi-run claims belong to `repeat`,
`saveLoadCompare`, or `differentialReplay`. Every declared assertion is consumed exactly once.
Never upgrade focused execution to `production-fixture` or detached Chromium to `public-route`.
Changes need adversarial false-positive coverage, not only a happy path.

## Scenario rules

Copy the nearest scenario; validate against `spaceface.simScenario.v1`. Fixed seed/ticks,
tick-indexed input, `state.rng` / `state.simTime` — never wall-time gameplay control. A single-arm
scenario uses `sf lab run`; declared equivalence must use its parent command. Lab rendering is
detached; player-visible quality still needs the packet's live route.

## Verification

Run the lab tests named by the changed seam (`node --test test/lab-*.test.mjs` and the matching
schema/runner/checkpoint/parity files). Certification-boundary edits also need the applicable
`holistic-*` and `lab-false-positive-guards` regressions. Direct browser runs are diagnostic.
Broker acceptance uses `scripts/validation-manifests/` and `scripts/validation-broker-cli.mjs`.
