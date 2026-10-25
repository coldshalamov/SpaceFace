# Shipbreaking Yard — exact-base integration

> Local integration: this feature is now wired into the production browser/Node registries, public interaction, save/reset, worker transport and existing presentation owners. Commission-time integration instructions below describe those seams; no feature flag is required.

Candidate for `coldshalamov/SpaceFace` at **34310c836bf80216b869331c54b777c231a637ee**.
The candidate intentionally owns only `src/features/shipbreakingYard/**`,
`src/data/encounters/8201-pro-yard.js`, and `test/pro-experiences-shipbreakingYard.test.mjs`.
The collector applies the shared imports below. Those shared files are unchanged in this branch.
Without these imports the focused composition is playable, but the main game does not instantiate
the new owner or discover the new encounter module.

## Production pieces

| Module | Responsibility |
| --- | --- |
| `runtime.js` | Registry-shaped Adventure owner: discovery, posted offers, claim/payment, work decisions, original-body delivery, partial failure, leave/return, repeat, lifecycle and bounded read model. |
| `physics.js` | Existing combat attachments, native Rapier admission, exact life/identity binding, measured authored collision skins, physical service release/vent/burst, existing damage owner, receiver gates. |
| `model.js`, `layouts.js` | Versioned plain ledger and three finite authored assembly graphs; deterministic variants; no additional random stream. |
| `integration.js`, `manifest.js` | Fresh simulation owner/table entries and import-boundary-pure manifest constants. |
| `save.js` | Concrete ordered save-plan, generator, restore and after-Continue adapters. |
| `browser.js` | One browser lifecycle owner for the existing deck, mixer and annotation renderer; frame hook and resource cleanup. |
| `bridge.js` | Bounded detached worker→main projection, with no native handles, entity objects or closures. |
| `presentation.js`, `audio.js`, `render.js` | Existing promptDeck decisions and remapped input labels, existing mixer cues, one bounded Three mesh of attachment/receiver annotations. |
| `8201-pro-yard.js` | Ordinary Adventure encounter at Ceres; introduces the same persistent yard that approach discovery uses. |

## 1. Register the simulation and browser owners

In `src/core/registry.js`, import:

```js
import { createShipbreakingYardSystemEntries } from '../features/shipbreakingYard/integration.js';
import { createShipbreakingYardBrowserEntries } from '../features/shipbreakingYard/browser.js';
```

Spread both arrays into the existing `buildRegistrySystemLookup` Map entries:

```js
...createShipbreakingYardSystemEntries(),
...createShipbreakingYardBrowserEntries(),
```

In `src/runtime/nodeSystemFactoryTable.js`, import and spread only
`createShipbreakingYardSystemEntries()` in the production lookup. Do not import `browser.js`
into the Node table. Each invocation returns a fresh owner; no registry shares mutable bindings.

In `src/runtime/authoritativeSystemManifest.js`, import the following from
`../features/shipbreakingYard/manifest.js` and insert them in the existing collections:

| Existing collection | Addition and position |
| --- | --- |
| `PRODUCTION_INIT_ORDER` | `...SHIPBREAKING_YARD_INIT_IDS`, after `towlineTablePrompt`. |
| `PRODUCTION_UPDATE_ORDER` | `...SHIPBREAKING_YARD_UPDATE_IDS`, after `towlineTable`. This observes settled physics/combat and precedes save. |
| `TABLE_CLOCK_IDS` | `...SHIPBREAKING_YARD_TABLE_CLOCK_IDS`. Admission, damage and attachment transitions use the fixed simulation tick. |
| `SYSTEM_CAPABILITIES` | `...SHIPBREAKING_YARD_CAPABILITIES`. |

Do not add the browser adapter to simulation update order. It subscribes to events at init;
the render hook below drives its GPU work. Its explicit `nodeSafe:false` classification keeps it
on the main thread in diagnostic worker mode. A Node-safe prompt system would be excluded from
the main registry in that mode even if its phase said `platform`.

## 2. Connect the existing save owner

Import from `../features/shipbreakingYard/save.js` in `src/save/saveSystem.js`:

```js
import {
  shipbreakingYardSavePlanEntry,
  serializeShipbreakingYardSteps,
  restoreShipbreakingYardSteps,
  afterContinueShipbreakingYard,
} from '../features/shipbreakingYard/save.js';
```

Use the adapters at these exact seams:

```js
// _saveCapturePlan(): immediately after the existing towlineTable entry
shipbreakingYardSavePlanEntry(this),

// _serializeDataSteps(): immediately after yield 'serialize:towlineTable'
yield* serializeShipbreakingYardSteps(this, data);

// _restoreChunks(): immediately after the towlineTable deserialize/yield,
// before player/persistent entities and combat attachments are restored
yield* restoreShipbreakingYardSteps(this, data);

// After _restoreCombatSteps, beside the existing towlineTable afterContinue:
afterContinueShipbreakingYard(this);
yield 'after-continue-shipbreakingYard';
```

The capture-plan and generator key orders must remain identical: the existing save checksum
depends on insertion order. `data.shipbreakingYard` is an additive version-1 section; old saves
with no section normalize to an undiscovered, unclaimed yard. No envelope version bump is needed.
The existing entity serializer owns persistent original bodies; the existing combat/native
serializers own attachments and solver state. The feature stores semantic identity, decisions,
pose/condition fallback, and terminal receipts. It rebinds matching restored originals and rejects
pooled numeric-ID substitutes. A terminal original restored from a synchronous payment callback
is retired before it can be sold again. No load path grants money.

## 3. Reset a fresh run

In `src/core/runReset.js`, import `SHIPBREAKING_YARD_FRESH_RUN_IDS` from
`../features/shipbreakingYard/manifest.js` and spread it into `FRESH_RUN_SYSTEMS` beside
`towlineTable`/`towlineTablePrompt`. Both owners implement `newGame` and `destroy`.
Their `game:new` listeners also clear retained state when the existing event path is used.
Leaving the sector parks paid work and shelves exact bodies; returning restores the decisions
and poses. Docking closes the work card. Abandonment keeps earned credits and permanently
relinquishes unreturned originals; an explicit next-lot action creates fresh identities.

## 4. Carry the read model across the worker boundary

In `scripts/lib/simEventBridge.mjs`, import:

```js
import { SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS }
  from '../../src/features/shipbreakingYard/bridge.js';
```

Spread it into `EVENT_BRIDGE_ADAPTERS`:

```js
...SHIPBREAKING_YARD_EVENT_BRIDGE_ADAPTERS,
```

The authoritative owner emits `shipbreakingYard:view` at 10 Hz and after meaningful decisions.
The supplied projector clamps the shape to three jobs, six modules and six couplings per job,
finite coordinates and bounded strings. The browser keeps a detached presentation projection.
It resolves current entity poses by exact job/module provenance and uses global-to-frame conversion
for the receiving scale and fallback positions. View/lifecycle listeners are synchronous so a
deferred old sector reset cannot erase a later valid offer. GPU drawing remains frame-owned.

This route deliberately needs no new `DOMAIN_MIRROR_KEYS` entry and no facade exposing the
authoritative yard. Offers, intents, receipts and semantic cues already fit the generic bridge.
Do not raise the bridge's shared depth limit. Do not mirror the private ledger for UI mutation.

After wiring the Node table, regenerate the existing main→sim forward set:

```sh
node scripts/lib/eventSurfaceCensus.mjs --forward-set
```

Confirm `MAIN_TO_SIM_BUS_EVENTS` includes `shipbreakingYard:action` (the exported
`SHIPBREAKING_YARD_MAIN_TO_SIM_EVENTS` records the required intent). The generated census should
find the literal emitter in `presentation.js` and subscriber in `runtime.js` once the latter is
reachable from the worker's Node table. There are no new key listeners or input actions.

## 5. Draw after the existing prepare phase

In `src/core/renderUpdatePhase.js`, import from `../features/shipbreakingYard/browser.js`:

```js
import {
  presentShipbreakingYardFrame,
  releaseShipbreakingYardPresentation,
} from '../features/shipbreakingYard/browser.js';
```

At the existing non-flight release check, call `releaseShipbreakingYardPresentation(state)`.
After `render.prepareFrame` and before `drawPreparedFrame`, beside `updateBombPresentation`, call:

```js
try { presentShipbreakingYardFrame(state); }
catch (err) { vfxError ||= err; }
```

Use an independent cosmetic try/catch so this cue mesh cannot suppress existing bomb/VFX/HUD
work. The adapter creates at most one annotation mesh, mounts the current scene, follows prepared
entity meshes, and disposes GPU resources at release/destroy. It never changes body poses or physics.
The main loop's existing registry destroy path cleans its event listeners and prompt.

## 6. Include ordinary encounter discovery

Regenerate the existing deterministic encounter index after collecting `8201-pro-yard.js`:

```sh
node scripts/build-encounter-index.mjs
```

The encounter is an ambient civilian Ceres introduction, not a mission that spawns replacement
cargo or pays a reward. It marks the same yard, offers its catalog if nearby, or offers a course
to the receiving scale. Independently, flying within 560 WU of the safe Ceres apron discovers
the yard and opens the catalog. Scanning selected Ceres station also introduces an undiscovered
yard and offers its marker. Placement respects full authored site reservations and the canonical
view of both dormant and live asteroid colliders. A scan of a selected/tethered original reopens
its work ticket; the production scanner's `targetId:null` pulse is handled. Marking a component
or the scale sets the existing waypoint with `autopilot:false`, preserving manual towing control.

## Acceptance and limits

Run the delivered focused suite in a normal checkout with the repository's declared dependencies:

```sh
node --test --test-isolation=none test/pro-experiences-shipbreakingYard.test.mjs
```

It composes the real simulation, economy, combat, native Rapier, scanner, tether gameplay and
flight owners. It distinguishes convenient delivery-gate fixtures from a complete native pilot
trip that uses only ordinary flight/tether controls after spawn. See `PHYSICS_CHECKS.md` and
`BRIEF_COVERAGE.md` for the physical measurements and player route. The tests also exercise the
real persistent-entity save owners, the ordered feature save adapters, worker event projection,
and browser lifecycle/resource boundaries.

The supplied source ZIP omits authored binary assets and some large generated context. Two exact
base generated JavaScript files were recovered through the repository connector for focused
execution; they are not candidate changes. A separate temporary visual fixture fetched and
hash-verified the seven exact-base GLBs and Basis decoder, then inspected seven browser frames
at native camera geometry with a neutral light rig. It establishes isolated asset fit and cue
readability. No full production browser boot, whole-game save envelope round trip, audible mix,
integrated HUD/lighting, or GPU/frame-time acceptance is claimed. Those remain the collector's
acceptance checks after the shared imports and normal asset set are present. The candidate does
not depend on another commissioned feature.
