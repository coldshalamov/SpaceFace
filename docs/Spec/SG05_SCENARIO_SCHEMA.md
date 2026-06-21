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

## Canonical File

```powershell
node scripts/sf.mjs validate scenario src/data/scenarios/47a.scenario.json
```

`npm run check:sg05` validates the canonical skeleton and malformed fixtures. It requires:

- the eight 47-A beats in the frozen order;
- the four resolution branches: escape, surrender, destroy, deliver;
- every beat to reference declared actors, proof metrics, world facts, and presentation lanes;
- every branch to change at least one immediate world fact;
- critical SG-08 cue ids to be reserved by the scenario contract.

## Boundary

This contract deliberately stops before implementing the full SG-05 DSL runtime, localization,
save-node migration, branch policy runner, or content hot reload. Future SG-05 work should extend
this schema and consume the same file rather than adding a parallel encounter format.
