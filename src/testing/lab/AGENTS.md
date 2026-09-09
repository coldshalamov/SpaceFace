<!-- LIFETIME: STABLE -->
# Deterministic gameplay lab agent guide

Read root `AGENTS.md`, then
[`../../../docs/VALIDATION_WORKFLOW.md`](../../../docs/VALIDATION_WORKFLOW.md). This scope owns the
deterministic scenario runtime, evidence classification, oracles, checkpoints, replay/equivalence
executors, and focused Chromium parity host.

## Start here

- Scenario contract/compiler: `../../contracts/simScenarioSchema.js`
- CLI: `../../../scripts/sf-lab.mjs`
- Runnable examples: `../scenarios/`
- Focused system bundles: `systemBundles.js`
- Evidence derivation: `evidenceClass.js`
- Runtime/checkpoints/oracles: `runScenario.js`, `checkpoint.js`, `oracleEngine.js`
- Parent equivalence executors: `repeat.js`, `saveLoadCompare.js`, `differentialReplay.js`
- Browser support boundary: `browserScenarioHost.js`, `chromiumHost.js`
- Current coverage limits: [`KNOWN_GAPS.md`](./KNOWN_GAPS.md)
- Architecture decision: `../../../design/lab/adr/0001-deterministic-gameplay-lab.md`

## Certification boundary

- Public certifying APIs select their own systems, execute their own arms, and evaluate their own
  equivalence. Callers may not inject systems, equivalence results, skipped assertions, or seals.
- Functions named `*Internal` or results marked `nonPromoting`/`internal-test` are test and
  collection surfaces, not acceptance evidence.
- Multi-run claims belong to their fixed parent executor: `repeat` for repeatability,
  `saveLoadCompare` for continuation, and `differentialReplay` for Node/Chromium parity.
- Every declared assertion must be consumed exactly once. Deferred, missing, duplicate, or
  caller-supplied equivalence cannot pass.
- Evidence class comes from execution reality. Never upgrade focused execution to
  `production-fixture` or detached Chromium execution to `public-route`.

Changes to those rules require adversarial false-positive coverage, not only a happy-path test.

## Scenario rules

- Copy the nearest scenario and validate against `spaceface.simScenario.v1`.
- Use fixed seed/ticks, tick-indexed input, stable aliases, quantitative metrics, and deterministic
  assertions.
- Use `state.rng` and `state.simTime`; never add wall-time gameplay control.
- Keep systems/fixture scope minimal and honest. System selection must remain explicit and
  evidence-derived; consult `KNOWN_GAPS.md` for currently supported profiles.
- A single-arm scenario uses `sf lab run`. A declared repeat/save-load/runtime equivalence must use
  its matching `repeat` or `compare` parent command.
- Rendering remains detached in lab evidence. Player-visible quality still needs the packet's live
  route and current capture.

## Verification

Run the narrowest changed seam first:

```powershell
node --test test/sim-scenario-schema.test.mjs
node --test test/lab-runner.test.mjs test/lab-scenarios-cli.test.mjs
node --test test/lab-save-load.test.mjs
node --test test/lab-checkpoint.test.mjs test/lab-checkpoint-compare.test.mjs
node --test test/lab-chromium-parity.test.mjs test/lab-browser-input-grammar.test.mjs
node --test test/validation-broker.test.mjs test/validation-process-control.test.mjs
```

For certification-boundary edits, also run the applicable `holistic-*` and
`lab-false-positive-guards` regressions named by the changed symbols. Do not consume a
Browser/Electron acceptance claim merely to validate source or documentation changes.

## Broker handoff

Chromium/public-route acceptance uses a manifest under `scripts/validation-manifests/` and
`scripts/validation-broker-cli.mjs`. Eligible manifests declare `requiresScenario`, whose path and
public executor are run freshly before claim minting. Direct browser runs are diagnostic and cannot
promote acceptance. Preserve failure fingerprints and obey `blocked_repeat`; never delete evidence
or perturb unrelated files to manufacture a new candidate.
