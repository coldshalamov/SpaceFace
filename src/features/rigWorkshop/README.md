# RATCHET — Physical Rig Workshop

Scoped production candidate for `coldshalamov/SpaceFace`, based on
`34310c836bf80216b869331c54b777c231a637ee`.

The candidate implements the workshop simulation, two outside work orders,
native physics and attachment adapters, persistent identity, promptDeck
presentation, authored body admission, and world-space assembly feedback.
The shared integration sites below are intentionally untouched under the
commission's path restriction. This is a candidate for local integration and
independent acceptance, not a claim that the unmodified shared entrypoints
already mount the feature.

## The player loop

An ordinary Adventure flight receives RATCHET's offer and a nearby bench marker.
Fly into the yard to meet **Tin Hand**, a cargo cradle, and **Yard Mule**, a powered
sled. The two machines are original persistent bodies, not templates respawned
on every visit. Eight reclaimed parts are available to try an idea.

Use the existing prompt deck to choose a machine, a part, a parent, and one of
five mounting positions. The preview shows its collision footprint. Blocked
fits explain why; cancel costs nothing. Confirming stages a real body and real
constraints. Stock is charged after native admission, and the last completed
fit can be undone at the yard. An ordinary short test pull is available before
accepting work.

Couple the ship, fly normally, and use the same deck to secure nearby cargo,
enable movers, release a load, or request delivery. The mover follows the
existing pilot thrust, strafe, and brake intent. There are no additional key
listeners, modal editor, independent flight controls, or pose-following rigs.
Owned loose payloads can also be carried outside the two contracts.

The first paid outside delivery carried at least 180 WU while attached to a
modified rig earns a single 100-credit recognition bonus. Actual loads, collision
contacts, spring forces, torque, and damage determine what happens on the way.
Long reach can catch a freight frame; a side motor changes the turn; a heavy
load needs an early brake and time to settle.

Broken joints retain the original parts. Recovery attaches the ship's normal
tow line to a nearby survivor. Bring the pieces together at the bench, cut
power, and repair/reseat them at their actual positions. A destroyed root does
not destroy the rig's name: another survivor becomes its root. If every part is
lost, fit a paid new keel under the same name and rebuild. There is no free
respawn or recovery teleport.

## The six parts

| Part | Existing authored place | Physical purpose |
| --- | --- | --- |
| Keel frame | `place_construction_frame` | Light spine and mounting faces. |
| Tow coupling | `place_tanker_coupling` | Ship hitch with clearance from the working end. |
| Cargo cradle | `place_container_rack` | Open collision mouth and one cargo restraint. |
| Scrap catcher | `place_scrap_cage` | Open collector with two small cargo restraints. |
| Powered mover | `place_welding_drone` | Reversible thrust along the actual fitted body axis. |
| Sacrificial guard | `place_power_skid_patched` | Dense protective face; its mass also affects braking. |

Tin Hand starts with a keel, hitch, cradle, and guard. Yard Mule starts with a
keel, hitch, catcher, and two movers. Both can be altered through the same
assembly route. The rig can carry a maximum of three cargo bodies, subject to
the fitted holders' capacity.

## Outside work

| Order | Physical work | Payment and limitation |
| --- | --- | --- |
| The Needle Orchard | Recover three original survey pods from a two-row freight-frame throat, then fly them to the receiving gantry. | Up to 180 cr per pod. Clearance and a careful corner matter; a wider route remains available. |
| A Very Bad Centre of Gravity | Transport two original thermal stores of 190 and 266 mass units from an abandoned kiln to a coolant tender. | Up to 300 cr per store. The asymmetric load strains the turn; brake early with mover assist enabled. |

Work sites are several hundred world units from the bench. Acceptance checks
bounded, deterministic candidate pockets against the existing world before
spawning any body. A blocked site can refuse cleanly. The contract then creates
its authored obstacles inside the clear pocket; it does not remove the world's
other obstacles.

Delivery requires the actual unpaid original, continuous native transport by an
assembled rig, proximity to the receiving circle, speed at most 6 WU/s, and spin
at most 0.4 rad/s. Damage reduces that body's payment. Each original also returns
one reclaimed part, once. Deliver some now and return for the remainder: the
**Mark a destination** menu locates a surviving dropped original at its current
position, the receiver, or the bench. A partial settlement retains every paid
receipt. Neither closed contracts nor copied replacement bodies pay again.

## Concrete shared integration

All executable adapters in these examples are included. Apply the imports and
calls in the existing owners; do not create a second simulation, renderer, save
store, input handler, or economy writer.

### 1. Both authoritative system lookups and the manifest

In `src/core/registry.js` and `src/runtime/nodeSystemFactoryTable.js`, import
`RIG_WORKSHOP_REGISTRY_ENTRY` from `../features/rigWorkshop/integration.js`
(adjust the relative prefix for the importing file) and include the entry in
each existing lookup's `entries` array. This covers both the browser registry
and the production worker/Node owner table.

In `src/runtime/authoritativeSystemManifest.js`:

- Put `rigWorkshop` in `PRODUCTION_INIT_ORDER` after `combat` has installed its
  helpers and before presentation mounting.
- Put it immediately before `physics` in `PRODUCTION_UPDATE_ORDER`. It queues
  this step's mover impulses and observes the previous completed native step.
- Declare it in `TABLE_CLOCK_IDS` (60 Hz). It is a Node-safe simulation system;
  its runtime does not import the view, DOM, audio implementation, or Three.

The runtime exposes the ordinary `init(ctx)`, `update(dt, state)`, `newGame()`,
`serialize()`, `deserialize(raw, { entityIdRemap })`, and `destroy()` contracts.
Do not call its physics adapter's kernel `prePhysics`/`postPhysics` separately
in production: the existing combat and physics owners already own those phases.

### 2. Save capture and restoration

Import these Node-safe save adapters in `src/save/saveSystem.js`:

```js
import {
  rigWorkshopSavePlanEntry,
  captureRigWorkshopSaveSlot,
  restoreRigWorkshopSaveSlot,
} from '../features/rigWorkshop/integration.js';
```

Insert the plan entry immediately after the existing `combat` entry:

```js
rigWorkshopSavePlanEntry(this.registry),
```

Insert the corresponding synchronous generator slot at the identical place,
after `data.combat` and its yield, before `data.physics`:

```js
captureRigWorkshopSaveSlot(data, this.registry);
yield 'serialize:rigWorkshop';
```

Matching insertion order matters to the existing envelope checksum. The feature
slot is additive and optional; absent data initializes an undiscovered fresh
workshop. Do not add an early ordinary `_callDeserialize` beside the venue bags:
these physical bodies need the completed persistent-entity ID map first.

In `_restoreChunks`, immediately after `_restoreCombatSteps(data.combat,
entityIdRemap)` / `combat-ledger-restored`, call:

```js
restoreRigWorkshopSaveSlot(data, this.registry, entityIdRemap);
yield 'rigWorkshop-restored';
```

This is after ordinary persistent bodies and the combat ledger, and before
deferred native reconciliation and `save:loaded`. The adapter adopts the same
token-bearing bodies already restored by the ordinary envelope. It remaps body,
root, connection, cargo, receipt, and receiver references together. It only
creates a missing original through canonical entity admission. Invalid state or
a foreign identity collision throws into the save session's existing rollback
path; it must not silently create a new pair of machines.

The ordinary save's native solver snapshot remains its owner. The feature
serializer preserves the semantic attachment records through the existing
combat persistence API; it does not pretend body scalars contain solver warm
starts. Ghost previews and open decision cards are excluded from saved state.

### 3. Worker mirrors and intents

Add `'rigWorkshop'` to `DOMAIN_MIRROR_KEYS` in
`scripts/lib/simReadModel.mjs`. The exported `RIG_WORKSHOP_MIRROR_KEYS` records
this contract without requiring a simulation import in the transport module.
The single bounded root is `rigWorkshop`; body poses and metadata continue
through the existing entity wire. The simulation root contains only plain data.

After the lookup/view imports are connected, regenerate the existing main-to-sim
event surface:

```sh
node scripts/lib/eventSurfaceCensus.mjs --forward-set
```

Verify `rigWorkshop:choose` appears in `MAIN_TO_SIM_BUS_EVENTS`. The exported
`RIG_WORKSHOP_MAIN_TO_SIM_EVENTS` states that contract. Presentation sends one
revision-bearing intent; the simulation checks the current prompt and consumes
the action before dispatch. Do not forward speculative UI writes into the state.

### 4. Existing visual factory and frame owner

In `src/render/visualFactory.js`, import `buildRigWorkshopBody` and
`isRigWorkshopBody` from `../features/rigWorkshop/view.js`. Before the generic
entity-type switch in `createVisualFactory().build(e)`, add:

```js
if (isRigWorkshopBody(e)) return stampBuiltVisual(buildRigWorkshopBody(e));
```

This keeps the normal authored-place admission, original entity ID/type and
generation, material/LOD ownership, stable visual boundary, and teardown. The
render-only facade selects the existing place wrapper for a native payload;
there is no second simulation entity or duplicate visual body.

In the existing `src/render/renderer.js` owner, mount one
`createRigWorkshopView({ state: ctx.state, bus: ctx.bus, scene })` on its normal
scene. Call `.frame(dt, state)` from its existing frame path and `.destroy()`
from its existing teardown/remount path. Use that owner's actual scene variable.

`createRigWorkshopView` composes the supplied presentation and render adapters,
waits for the ordinary prompt deck to become available, and uses the existing
floating-origin membrane. Mounting it early is supported; the mirrored current
prompt can hydrate after the view. **Do not also mount a second workshop
presentation in uiRoot.** Alternatively, an integrator can mount the separately
exported presentation and marks in their respective existing owners, with the
same update/cleanup calls.

The overlays use one bounded instanced mesh. Attachment spans come from real
anchors; load notches provide a shape cue alongside color. Preview outlines
include the open rack mouths. Invalid placements carry a cross, and snapped
connections have a visible gap. No flashes, pulses, camera animation, or extra
scene lighting are introduced.

### 5. Discovery and run lifecycle

The self-registered encounter is
`src/data/encounters/8202-pro-rig-workshop.js`. Regenerate the existing catalogue
index with `node scripts/build-encounter-index.mjs`. The director entry and
guaranteed ordinary-Adventure approach both call the same live owner, so neither
can duplicate a bench or the machines.

Add `rigWorkshop` to `FRESH_RUN_SYSTEMS` in `src/core/runReset.js`. Its `newGame()`
removes only feature-owned bodies/attachments and starts a fresh identity ledger.
An ordinary `destroy()` only unregisters this adapter; it does not destroy the
shared combat kernel or erase durable machinery. Presentation handles docking,
sector departure, new-game, and load events and disposes every subscription.

## Ownership, determinism, and bounds

| Authority | What this feature asks it to do |
| --- | --- |
| Canonical entity lifecycle | Admit or remove original part/cargo/bench bodies; allocate normal IDs. |
| SG-02 native physics | Integrate all movement, contacts, torque, and actual compound collision geometry. |
| Combat attachments | Create, solve, warn, separate, and restore braces, cargo clamps, and ship towing. |
| Economy | Apply `economy:grantCredits` after the feature commits an original-cargo receipt. |
| promptDeck | Own keyboard/gamepad/pointer choices and the decision surface. |
| Existing navigation | Track the bench, original cargo, receiver, or original surviving body. |
| Existing save session | Capture at the authoritative boundary, restore IDs/native state, and roll back a rejected restore. |

The feature uses simulation time, deterministic local searches and serial
tokens; no ambient random numbers or wall-clock timers decide outcomes. Limits
are two rigs, eight live parts and three cargo bodies per rig, twelve semantic
connections per rig, twenty-four retired identities per rig, sixty-four owned
body records, two work orders, five original-cargo receipts, and 384 overlay
instances. The workshop is excluded from Survival, Racing, tutorials, replay,
the other physics venues, and docked or paused play.

See [VALIDATION.md](./VALIDATION.md) for the exercised behavior, exact command,
visual evidence boundaries, and remaining integration acceptance work.
