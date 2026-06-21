# SG-07 Phase 0 Evidence Schema

Source of truth: `MASTER_MAKEOVER_PLAN.md` SG-07 plus `47A_SLICE_CONTRACT.md`.

This is the first narrow schema-governed contract for the 47-A evidence bundle. It exists so agents
can extend replay, telemetry, and content fixtures through validated files instead of inventing new
fields in ad hoc JSON.

## Current Schemas

- `spaceface.goldenInputTape.v1` — deterministic input frames for the current `47a` headless run.
- `spaceface.telemetryEnvelope.v1` — expected replay hash, Phase 0 metric ceilings, future
  subscribed trace types, and observed trace counts for that tape.
- `spaceface.scenarioContract.v1` — the first SG-05 47-A beat/branch/fact/proof skeleton.
- `spaceface.evidenceValidationResult.v1` — machine-readable validation issues with `file`, `path`,
  `rule`, and `message`.
- `spaceface.scenarioValidationResult.v1` — machine-readable SG-05 validation issues with the same
  issue shape.
- `spaceface.sfCliResult.v1` — versioned CLI envelope emitted by `scripts/sf.mjs`.

## CLI

```powershell
node scripts/sf.mjs validate test/47a.inputs.json test/47a.telemetry.expected.json
node scripts/sf.mjs validate scenario src/data/scenarios/47a.scenario.json
```

The command emits JSON and exits nonzero if any schema, field, range, ordering, or cross-file
reference check fails.

`npm run check:contracts` runs the replay-evidence validation in CI-style checks. `npm run check:sg05`
runs the scenario contract validation. `npm run check:sim` also passes
`--expect test/47a.telemetry.expected.json`, so replay hash drift must be an intentional envelope
update rather than an invisible behavior change. The same expectation file also asserts the trace
event counts emitted by the current 720-tick headless run.

## Scope Boundary

This is not the full SG-07 schema system. It is the first production contract for the active 47-A
evidence handles and SG-05 scenario skeleton. Broader ships, actions, dialogue, assets, audio, VFX,
localization, and tuning schemas should extend this pattern only when their owning SG contracts are
ready.
