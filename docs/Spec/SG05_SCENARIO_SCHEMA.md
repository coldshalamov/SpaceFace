# SG-05 Phase 0 Scenario Contract

Source of truth: `MASTER_MAKEOVER_PLAN.md` SG-05 plus `47A_SLICE_CONTRACT.md`.

This is the first narrow scenario graph contract for 47-A. It is not the complete mission runtime.
It exists so content, dialogue, policy, AI, presentation, and replay work must attach to declared
beats, actors, proof metrics, and immediate world-fact consequences instead of accumulating bespoke
logic in UI, renderer, or one-off mission code.

## Current Schema

- `spaceface.scenarioContract.v1` — a validated 47-A beat graph with actors, world facts,
  presentation event ids, proof metrics, beat order/windows, and outcome branches.
- `spaceface.scenarioValidationResult.v1` — machine-readable validation issues with `file`,
  `path`, `rule`, and `message`.
- `spaceface.scenarioRuntimeSummary.v1` — the headless 47-A runtime proof that the validated
  contract was loaded, beats advance by sim time, facts initialize, and the complete Phase 0
  scenario actor cast binds through declared actor metadata.

## Canonical File

```powershell
node scripts/sf.mjs validate scenario src/data/scenarios/47a.scenario.json
```

`npm run check:sg05` validates the canonical Phase 0 scenario and malformed fixtures. It requires:

- the eight 47-A beats in the frozen order;
- the four resolution branches: escape, surrender, destroy, deliver;
- every beat to reference declared actors, proof metrics, world facts, and presentation lanes;
- every branch to change at least one immediate world fact;
- critical SG-08 cue ids to be reserved by the scenario contract.
- the canonical `sf-sim 47a` run to load this contract, emit deterministic `scenario:*` trace
  evidence, snapshot/save/reload the scenario state, bind all required Phase 0 actors, and prove
  beat progression through `scavenger_arrival` in a longer replay.

## Boundary

This contract deliberately stops before implementing the full SG-05 DSL runtime, localization,
branch policy runner, content hot reload, or the complete live branch implementation. The Phase 0
runtime bridge is only a boot/evidence layer: it consumes this same file, initializes facts and
actor bindings, and proves the first live beat transitions without adding a parallel encounter
format. Future SG-05 work should extend this schema and consume the same file for policy,
dialogue, localization, and branch execution.
