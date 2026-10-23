# Hinge Works: industrial disasters

Scoped production candidate for `coldshalamov/SpaceFace`, based on exactly
`34310c836bf80216b869331c54b777c231a637ee`.

The feature supplies a fixed-step owner, native physical site, encounter invitation, existing
decision-deck presentation, authored-place renderer, worker transport and save adapters.
Shared registration, save and render imports are deliberately left to the local collector, as
required by the commission. The unmodified base does **not** register this feature automatically.

## Play route

Travel in **Adventure** to the **Ceres Refinery Approach**. Hinge Works is at sector-local
`(-1520, 240)`, global `(-13808, 8432)`. The ordinary civilian encounter can offer a distress
destination before arrival. **Mark Hinge Works** places a normal navigation marker only after
the player chooses it; receiving or dismissing the call leaves the current route intact. The
saved signal permits a fresh marking offer after returning or loading.

Approaching within 560 world units always discovers the place, independently of a random
director roll. The site initially holds its traffic. Inspect, close the channel or fly on without
spending a rescue window. **Take the response** releases the current accident only after its
original bodies and authored presentation are admitted. Use the existing flight, Massline and
field controls; there are no feature-specific key bindings or new control panels.

| Incident | Physical cause | Useful interventions | Recoverable failure |
| --- | --- | --- | --- |
| Runaway consignment | A disabled conveyor hauler is moving toward two solvent tanks. An impact can rupture a tank; its finite hot spill can rupture the neighboring one. | Tow or push the hauler sideways; move either tank out of the line; separate a leaking tank from its neighbor. | Loading pods can lose thrust before people are lost. Tow stranded survivors and damaged equipment into the refuge. |
| The closed lane | A hot carrier approaches two shelter pods while torn plates obstruct their departure route. | Pull or tow the plates off the marked lane; divert or hold the hot carrier away from the pods. | Opening a route only counts when the actual pods use it and arrive. Disabled pods and the medical consignment remain recoverable. |
| Live feed | A faulted power skid supplies nearby machinery through a real flexible native cable and coupling. | Winch the coupling free; haul the source away; move a machine out of feed reach. | One mill can seize while the other is preserved. Isolation immediately stops connected damage; the engineer, cargo and damaged parts can still be recovered. |

The refuge is the open three-sided receiving bracket. A rescued pod must physically arrive;
opening a lane, clicking a prompt or issuing a tow does not earn a rescue. The radio reports
named transitions and explicit safe/lost/recoverable counts. Ruined machinery recovered as
scrap remains a loss of service capacity. Optional loose salvage remains where it was left.

Once the danger is controlled, **Close response** records the current outcome even if recovery
is incomplete. Further physical rescue can update the record, but it cannot reopen a paid
settlement. The ordinary economy and faction owners apply the single bounded settlement.
There is no separate inventory pool, generic kill loot or duplicate cargo grant.

**Next incident** deliberately replaces the previous cycle's actors after closure and requires
the player to release their line. The bounded site ledger and loss witness marks remain.
**Practice** is an explicitly unpaid drill: it keeps the real aftermath snapshot, creates one
temporary cycle and restores the real objects and their changed positions when the drill ends.
Closing the channel never resets a live response.

## Ownership and lifetime

| Module | Responsibility |
| --- | --- |
| `scenarios.js` | One authored site and three immutable physical configurations. |
| `causality.js` | Deterministic causes, contacts, geometry, exposure, loss and recovery records. It returns intents rather than writing physical state. |
| `physicalSite.js` | Canonical entity lifetime, native impulse/torque requests, combat damage, actual native attachment creation/severance and bounded semantic snapshots. |
| `runtime.js` | The single feature clock, Adventure discovery/commands, residency, settlement receipts and save/reset/cleanup lifecycle. |
| `encounter.js` | Director-compatible civilian distress invitation. The invitation owns no victims, deadline or reward. |
| `presentation.js` | Existing `encounterChoicePrompt` / `promptDeck` choices, bounded comms and existing audio cues. |
| `render.js` | Existing authored-place boundaries on original native poses, floating-origin interpolation, refuge/route/hazard geometry, presentation admission and pointer-picking composition. |
| `workerAdapter.js` | Narrow command forwarding and bounded shallow status/pose packets through the existing lane bridge. Main-side copies retain actual native IDs and never integrate physics. |
| `presentationAdapter.js` | Browser mount/update/dispose entry point for the two presentation adapters. |
| `saveAdapter.js` | Section capture, non-destructive validation and restoration through the registered owner. |
| `manifestAdapter.js` | Pure registration metadata and idempotent init/update/clock insertion helpers. |

All actors remain original `payload` identities with existing authored place IDs. The render-only
`fx` descriptor satisfies the stock place loader's visual vocabulary; it is never a second sim
entity. The original body is admitted only after the actual authored boundary is ready. Pending
bodies are non-colliding and cannot be acquired with Massline. Scene epochs reject delayed
admission callbacks from a prior visit or load.

The renderer owns its private mesh map. The feature exposes a read-only union on the public
mesh read surface so the existing pointer ray, hover and target owners can find its exact IDs;
it does not put custom roots in the stock renderer's disposal sweep. Disposal restores the
original public map and retires only feature-owned visuals. Authored boundaries have frozen
matrices, so native pose updates explicitly update their local matrices.

There are at most six incident bodies and two contextual authored silhouettes. Marker geometry
uses four fixed-capacity batches. Radio transitions are deduplicated; ordinary transition speech
is spaced by simulation time and warning sounds have a six-second minimum interval. Existing
reduced-motion and reduced-flash settings suppress animated route cues.

Leaving the residency radius snapshots and unloads the incident; its crisis clock is suspended
while absent. Returning resumes that physical progress. An attached player line keeps its load
resident, including a cold restore while towing outside the worksite radius. The line restores
once through the native attachment owner and a subsequent cut stays cut. Destruction produces
permanent role tombstones. No missing actor is silently replaced.

## Required shared integration

These are the concrete collector seams. Do not add a second feature clock or a second save root.

### 1. Register the authoritative owner

In `src/runtime/authoritativeSystemManifest.js`, use `withIndustrialDisasters` from
`../features/industrialDisasters/manifestAdapter.js` to add the ID exactly once:

- `PRODUCTION_INIT_ORDER`: phase `init`, after `asteroidSites`.
- `PRODUCTION_UPDATE_ORDER`: phase `update`, after `tetherGameplay`.
- `TABLE_CLOCK_IDS`: phase `clock`, after `tetherGameplay`.

`industrialDisasters` is node-safe and uses the manifest's ordinary sim capability. Add the named
definition from `../features/industrialDisasters/runtime.js` to both lookup tables:

- `src/core/registry.js`, `buildRegistrySystemLookup`.
- `src/runtime/nodeSystemFactoryTable.js`, `getNodeSystemFactoryTable`.

The entry is `['industrialDisasters', industrialDisasters]`; the exported
`industrialDisastersFactoryEntry` validates the same entry if the collector uses that helper.
Keep the existing combat/physics, economy and faction owners. The feature's `destroy()` hook is
compatible with the actual browser registry teardown. Both public `game:new` and lane-neutral
`game:newGame` clear it; `save:loaded` preserves it.

### 2. Include the encounter

The authored shim is `src/data/encounters/8205-pro-industrial-disasters.js`. Run the existing
`node scripts/build-encounter-index.mjs` during integration to include it in
`src/data/encounters/index.generated.js`. The generated shared index is outside this candidate's
authorized edit scope. Do not install a parallel encounter director.

### 3. Add the save section at the real capture/restore boundary

Import the functions from `../features/industrialDisasters/saveAdapter.js` into
`src/save/saveSystem.js`.

In **both** `_saveCapturePlan()` and `_serializeDataSteps()`, add the `industrialDisasters`
section in the same relative position: after the existing physical-play sections and before
`world`, `entities`, `combat` and native `physics`. The key order is part of the save checksum.

```js
// _saveCapturePlan entry
['industrialDisasters', () => captureIndustrialDisasters({
  state: this.state, registry: this.registry,
})],

// matching _serializeDataSteps section
data.industrialDisasters = captureIndustrialDisasters({
  state: this.state, registry: this.registry,
});
yield 'serialize:industrialDisasters';
```

Validate `data.industrialDisasters` with `validateIndustrialDisastersSave` **before opening the
destructive restore session**. Refuse unsupported feature, crisis or physical schema versions.
An absent section is the supported old-save case. Keep checksum, migration, rollback, storage
and commit ownership in the existing save system.

In `_restoreChunks()`, after restoring player/economy/factions and before world-sector
materialization, call:

```js
restoreIndustrialDisasters(data.industrialDisasters, {
  state: this.state, registry: this.registry,
});
yield 'industrialDisasters-restored';
```

The owner snapshots live bodies when capturing, including an initial impulse submitted just
before a native solve. It restores its own bounded semantic rows after the normal load fence.
Do not add persistent flags to these actors or copy them into another generic salvage/entity
save section. The feature section preserves actual progress; the ordinary native physics
section continues to own solver snapshots and admission.

### 4. Mount the browser presentation

After the real render scene and ordinary encounter choice presenter exist:

```js
import { createIndustrialDisastersPresentation }
  from '../features/industrialDisasters/presentationAdapter.js';

const industrialView = createIndustrialDisastersPresentation({
  state, bus, scene: state.render.scene, renderer: state.render.renderer,
});
// In the host's existing render frame, with its existing interpolation alpha:
industrialView.update(alpha);
// In that scene's normal teardown:
industrialView.dispose();
```

No input, CSS, keyboard or simulation-loop additions are needed. In worker mode the view uses
the existing `laneBusEmit` command port and the existing all-event presentation bridge. Status
packets are flattened to survive its depth/reference projection, and at most six native pose
rows are sent per authoritative step. No broad `state.industrialDisasters` mirror is required.
The main adapter reconciles exact-ID facade copies, target-read indexes and journal rebuilds;
it never creates native bodies. Keep `bridgeAll` enabled as it is in the production lane.

## Focused evidence and acceptance limits

Run:

```sh
node test/pro-experiences-industrialDisasters.test.mjs
node --test --test-reporter=spec test/pro-experiences-industrialDisasters.test.mjs
```

The focused suite exercises real Rapier, entity lifetime, combat damage, economy/factions,
actions, Massline and field owners. It covers ordinary proximity and remote encounter discovery,
inspect/accept/refuse/cancel, two physical interventions per crisis, partial outcomes, actual pod
traversal, changed aftermath, cold restoration, destroyed-role tombstones, queued-motion saves,
unpaid repetition, idempotent settlements, new-game versus load, teardown, worker transport and
actual pointer ray selection of original IDs. It uses the base's exact Three `0.186.1` and
Rapier `0.19.3` dependency versions.

This evidence is **focused-explicit**, not a production-manifest acceptance claim. The Three
tests use injected primitive authored-loader boundaries to check ownership, frozen transforms,
interpolation, picking and cleanup. A separate stock-factory check confirmed the frozen matrix
contract. The supplied source archive omits release binaries; actual authored GLB appearance,
gameplay-camera legibility, full Adventure boot, device/GPU performance and the collector's
whole-save integration remain unmeasured. Run those acceptance checks after applying the shared
seams and restoring the release assets. No visual goldens, package files, shared source or peer
commission files are part of this candidate.
