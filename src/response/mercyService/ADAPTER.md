# Mercy Service production host

`createMercyServiceSystem()` now creates `live.js`, which observes the production physics owner and queues bounded impulses. The old private integrator is only an offline catalog fixture, exposed as `createMercyFixtureSystem()`; it must never enter the default registry.

The live host discovers one deterministic board emergency per sector through the ordinary scanner. It emits a zero-reward `recon_scan` offer with `source: 'mercyService'`, `params.mercyIncidentId`, `mercyOrigin`, and `settlesExternally: true`. The missions owner accepts it; normal Massline joints, native safety clamps, torque stabilizers and containment operate on authored Forge place entities. Contact damage uses actual native contacts through combat. Vent, horizon and capture failures can materialize a second physical incident.

Root integration owns registry/factory/save, the guarded `mission:venueProof` / `mission:venueFailure` listeners, and the existing prompt UI. `verifyMissionProof` and `verifyMissionFailure` bind those receipts to this host. `mercyServicePublic` is the plain public mirror. Schema 2 snapshots preserve actor identity and receipts; restoring never replays player movement. Sector exit, new game and destroy remove only stamped owned bodies and constraints.

Focused production verification: `node --test test/mercy-service-live.test.mjs`. The original catalog tests below exercise authored scenarios offline; they do not claim twelve native player-route completions. Browser/GPU and complete Adventure acceptance belong to the integration run.

## Historical proposal (superseded)

This file is the last-mile hook. It was not applied. Do not treat the campaign as shipped, and do not rename `tow_recovery` or `rescue_under_fire`.

The witness in this folder already runs the twelve emergencies on `LOOP_FIXED_DT` (`1/60`). It emits intents and does not write credits, reputation, or heat. Landing it in Adventure flight means registering that witness and spawning its bodies through the existing entity / physics owners. Those files are outside this campaign's write root and are shared with other agents.

## Conflicting paths (do not edit in the mercy PR)

- `src/data/missions.js` — existing `tow_recovery` and `rescue_under_fire` contracts stay as they are
- `src/systems/missions.js`
- `src/systems/npcJobsRuntime.js`
- `src/core/registry.js`
- `src/runtime/nodeSystemFactoryTable.js`
- `src/runtime/authoritativeSystemManifest.js`
- world placement, economy, factions, heat, and `src/ui/**`

`publishedGlb` on every `MERCY_MODELS` entry is `null`. Collision states are what the witness measures. A Forge/GLB pass under `assets/ships/mercy-service/**` was not run.

## Exact registration patch (withheld)

`createMercyServiceSystem()` in `runtime.js` is the system object. Its `name` is `mercyService`. It reads `state.input` and optional `state.input.actions` keys `mercyClamp`, `mercyStabilizer`, `mercyContainment`, `mercyTarget` when they already exist. It does not add keys to `src/systems/input.js`.

Insert the id **after** `tetherGameplay` in `PRODUCTION_UPDATE_ORDER` and `PRODUCTION_INIT_ORDER`, and add `'mercyService'` to `TABLE_CLOCK_IDS` (the gates are per fixed tick, not a near-clock cohort). Add the same pair to `src/core/registry.js` and `src/runtime/nodeSystemFactoryTable.js`:

```js
import { createMercyServiceSystem } from '../response/mercyService/index.js';
// inside the factory list, after tetherGameplay:
['mercyService', createMercyServiceSystem()],
```

Save slice, owned by the save envelope when that adapter lands:

```js
state.mercyService = snapshotMercy(ctx.mercyService);
// on continue:
restoreMercy(ctx.mercyService, state.mercyService);
```

Intents the bus already understands:

- `economy:grantCredits` / `economy:chargeCredits` — economy is the credits writer
- `distress:rescued` — factions apply rescue standing
- `faction:repDelta` — unlawful custody only (`delta` is set)
- `mercyService:lawFact` — not a `law:reportIncidentReceipt`. lawSecurity must validate it before heat moves

Do not emit `mission:completed` for these ids until a mission row exists. Adding a row belongs in a later patch to `src/data/missions.js`, and that patch must not rename `tow_recovery` or `rescue_under_fire`.

Suggested offer shape, still not applied:

```js
{
  id: 'mercy_service_distress',
  type: 'mercy_service',
  params: { incidentId: 'ms_pod_traffic' },
}
```

The mission system would call `beginIncident(rt, params.incidentId)` when the player accepts, and would read `report(rt)` for completion. It would not teleport survivors into credits.

## Proof that does not need those files

```bash
node --test src/response/mercyService/mercyService.test.mjs
node src/response/mercyService/demo.mjs
```
