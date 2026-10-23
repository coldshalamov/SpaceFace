# SWITCHBACK — convoyRaid source candidate

## Authority and disposition

This candidate was built against `coldshalamov/SpaceFace` master at exact base
`45a97fdbda62611cc13001bd16790f8afa844753`. The supplied context ZIP SHA-256 was
`af7c8aa1f48ba55d1c855f9ce4ef540d05513fff9c6dbad113cf246ac0082724`.
`HANDOFF_CONTEXT.json` identity and every included source hash were verified before
implementation. The remote Git commit/tree identity was also checked. Unpushed
local state was not available and has not been inferred.

The feature implementation, production adapters, encounter definition and focused
tests are complete within the commissioned write scope. Shared registration,
save-envelope wiring, generated indexes, live acceptance and any current-tree
conflict resolution belong to Codex. None of those shared files is modified by
this candidate. There is no separate game, renderer, input binding or dependency.

## What the player does

The optional departure is in the outer Ceres belt, sector-local `(-1500, -700)`.
`switchbackEntryPoint()` uses the real sector-coordinate owner; at this base the
global point is `(-13788, 7492)`. Approaching within 360 world units requests the
normal encounter choice surface, with ordinary director pacing. Nothing spawns
until **Escort the freight** or **Inspect the couplers** is accepted. Decline and
timeout create neither a cast nor a payment. The empty planner `zoneTypes` in
`8103-pro-five-convoy-raid.js` prevents arbitrary ambient scheduling; the deliberate
request supplies `mining_belt` and the fixed anchor. Helios starter spawn is never
an entry location.

Acceptance creates the authored Hawser tug, four individually simulated authored
industrial containers, two real escort ships and two physical receiver structures.
One interior carriage has a stable serial, double chevrons, double brackets and
three dorsal bars. Inspection does not commit a crime. It exposes the target and
both boundary joints before the player decides whether to interfere.

- **Lawful escort:** stay with the moving target for at least 20 seconds, or
  actually damage a nearby hostile raider while defending it, then arrive near
  the live freight receiver. Two real pirate ships enter once at 30% route
  progress. Delivery pays 720 credits; verified defense adds 240. Missing freight
  reduces the payment by 200 per loss.
- **Service release:** match velocity within 12 wu/s and approach within 32 wu of
  a real coupler. The existing prompt deck arms a 1.2-second service operation.
  Hold physical station; leaving eligibility cancels it. The prompt also exposes
  explicit cancellation. Release both target boundaries. A 2.4-second emergency
  brace closes the next service window and brakes the powered chain.
- **Noisy release:** ordinary gun contacts at a real carriage end damage the
  adjacent joint. A 65-point accepted hit is a full unbraced joint's integrity;
  a brace reduces that damage. Gunfire still damages the real hull through the
  combat owner. There are no invisible damage proxies.
- **Physical separation:** existing Shove, Pull, Rig and massline forces load the
  same reciprocal coupler solver. A sustained restraint or strong velocity shock
  can break a chain. Pin retains its shipped meaning: it launches a static Mass
  Seed anchor; connecting cargo to that anchor through the existing Twin Bridle
  creates the restraint. This feature does not redefine Pin as a freeze command.
- **Theft:** isolate the marked carriage, physically cross the directed side-fork
  gate, then slow below 14 wu/s inside the live side receiver for 1.5 seconds while
  the player remains within 150 wu. The actual target body is consumed once.
  Full-condition payment is 1650 credits, reduced by damage and player-caused
  collateral. Other carriages cannot substitute for it. Crossing the receiver
  alone, crossing the fork backward, remote delivery and a loose multi-carriage
  chain do not satisfy the contract.

The close guard recovers the valuable detached component; the cutter chases a
nearby witnessed thief, otherwise protects freight. Recovery adds a finite,
reciprocal towing spring and uses existing AI movement. It never snaps a carriage
back onto the route or repairs a severed joint. The visible recovery cable exists
only while that real spring is active. Ordinary recovery towing of an already
detached carriage under an escort contract is lawful; exporting player-handled
freight through the side fork changes the contract to theft.

## Minimal shared integration

### 1. Register one authoritative fixed-step system

Create a fresh synchronous production owner for each registry:

```js
import { createConvoyRaidProductionSystem } from '../features/convoyRaid/production.js';
const convoyRaid = createConvoyRaidProductionSystem();
```

Use the correct relative path in each owner below. `index.js` exports the pure
catalog/runtime/geometry/controller/view surfaces and an optional async production
loader; the production manifest should use `production.js` synchronously.

| Existing owner | Minimal change |
| --- | --- |
| `src/core/registry.js`, `buildRegistrySystemLookup` | Add the production import and `['convoyRaid', convoyRaid]`. |
| `src/runtime/nodeSystemFactoryTable.js`, `getNodeSystemFactoryTable` | Add the same production import and lookup entry. |
| `src/runtime/authoritativeSystemManifest.js`, `PRODUCTION_INIT_ORDER` | Add `convoyRaid` after `encounterDirector`. |
| Same file, `PRODUCTION_UPDATE_ORDER` | Add `convoyRaid` immediately before `physics`, following `ruud`. This is after flight, weapons and fields. |
| Same file, `TABLE_CLOCK_IDS` | Add `convoyRaid`: it is a 60 Hz table-clock owner. |

The order is significant. Stock `flightV3` visits moving ships even with `ai:null`
and otherwise applies neutral flight controls to the tug. SWITCHBACK replaces
only that tug's continuous control through `writePhysicsControl`, then queues its
own impulses through `queuePhysicsImpulse` and `queuePhysicsTorqueImpulse`.
Already queued player-power impulses are retained. Physics is the only live
transform/velocity writer. Do not integrate this system from the director's slow
calendar `tick`; that wrapper handles offers and observes completion only.

The solver accepts steps up to 1/30 s; normal operation is 1/60 s. Do not move it
onto a decimated near/calendar clock. `integrateTrainHeadless` is explicitly for
the focused model tests, never for live entities. Finishing a contract leaves
surviving physical couplings active; paying a receipt does not turn off physics.

### 2. Include the authored encounter module

`src/data/encounters/8103-pro-five-convoy-raid.js` exports `encounterOrder`, `trigger`,
`runtime`, and the default `defineEncounter` result. It uses the actual
`fire(d, live, state)`, `choose(d, live, state, choiceId)` and
`tick(d, live, state, now)` signatures inspected in `glueMeetMassRuntime.js`.

On the complete current tree, regenerate the normal encounter index using
`npm run build:encounter-index`; the generated `src/data/encounters/index.generated.js`
is intentionally absent from this candidate. No second offer is sent for service
latches: the director consumes an encounter choice only once. Ongoing actions use
the prompt-deck adapter described below.

The public geographic entry is `registry.get('convoyRaid').requestOffer()`.
It is also called by the idle authoritative update and checks live mode, sector,
player health, distance, survival/venue exclusion, prior offer/receipt and pacing.
For an existing deliberate UI/debug route, the same method is the supported seam.
`start({runId, choice:'escort'|'theft', seed, encounterId})` remains guarded by the
same physical lane and by stable ID, spawn budget, builder and overlap checks.
It chooses among four deterministic clear initial formations before spawning;
it never teleports a formation after admission.

### 3. Wire the save owner once

| `src/save/saveSystem.js` seam | Minimal addition |
| --- | --- |
| `_saveCapturePlan()`, after `wreckCourt`, before `world` | `['convoyRaid', () => this._callSerialize('convoyRaid')]` |
| `_serializeDataSteps()`, matching position/order | `data.convoyRaid = this._callSerialize('convoyRaid');` |
| `_restoreChunks()`, after `wreckCourt` deserialization | `this._callDeserialize('convoyRaid', data.convoyRaid);` |

The existing capture-plan and stepped serializer key order must remain aligned.
Codex owns any required current-tree save-version migration and generated schema.
Absent legacy data creates an empty feature store; active malformed identities
fail closed.

The runtime has `serialize()` and **`deserialize(saved)`** for these exact owner
calls. `deserialize` stages the plain graph/controller state and waits for the
existing `save:loaded` event before rebinding. `restore(saved)` is a convenience
for already materialized test/tools contexts and rebinds immediately; do not call
it during early save restoration.

No second actor serializer is needed. `_serializeEntities()` already includes
all living `flags.persistent` actors. `plainEntity()` preserves pose, velocity,
spin, physics specification and `data.convoyRaid`; `_spawnPersistentEntities()`
restores them after world regeneration. All feature actors carry that flag.
The final rebind selects actual tagged survivors by logical run/body IDs and
records their new numeric ID/generation. Missing or duplicate identities become
losses. Lost model bodies cannot revive from a stale observation. Latch dwell and
the previous crossing sample restart; target identity, severed topology,
collateral, fork authorization and settlement receipts persist. The runtime
never respawns a missing saved carriage or replays a settled payment.

### 4. Attach the view to the existing VFX owner

In `src/render/vfx.js`, import:

```js
import { createSwitchbackView } from '../features/convoyRaid/view.js';
import { getPromptDeck } from '../ui/promptDeck.js';
```

After `_combatBeamLocalizer` is initialized in `init(ctx)`:

```js
this._switchback = createSwitchbackView({
  THREE, state: this.state, bus: this.bus, getDeck: getPromptDeck,
  toLocalXZ: this._combatBeamLocalizer,
});
```

In the same update lane as `_tetherWebFx?.update(this.state)` call
`this._switchback?.update()`. In `destroy()` call
`this._switchback?.dispose(); this._switchback = null;`.

This existing VFX phase is after `prepareFrame` and before `drawPreparedFrame` in
`src/core/renderUpdatePhase.js`. The view reads `state.render.scene`, handles scene
replacement, and uses the existing `presentedAnchorXZ`/`presentedAnchorRot` helpers
with `state.render.interpolationAlpha`. Coupler endpoints therefore follow the
actual drawn bodies and the renderer's floating origin. The feature owns only
bounded coupling/glyph geometry: 72 rod instances and 256 line segments. The
Hawser, containers and escorts remain existing authored assets. No generated art
or flat proxy bodies are introduced.

`readout()` provides non-color objective/status facts for an existing HUD surface
if desired. Essential nearby actions already use the actual prompt-deck
`offerDecision`, `updateDecision`, `hasDecision` and `resolveDecision` APIs, with
existing pointer, keyboard and gamepad routing. The view emits only the feature's
declared `convoyRaid:command` event; the runtime validates run ID and accepts only
`releaseCoupler`, `cancelLatch` and `abandon`. UI cannot submit combat evidence or
money. There are no new input bindings or DOM overlays. Reduced-motion geometry
is static; flash reduction lowers cue opacity/emission without removing shape
tells.

### 5. Preserve the existing worker/main membrane

The shipped worker lane needs the same feature state and intent routing as the
same-thread game route. Make these small additions in the existing shared owners:

| Existing owner | Minimal change |
| --- | --- |
| `scripts/lib/simReadModel.mjs`, `DOMAIN_MIRROR_KEYS` | Add `'convoyRaid'`. |
| Same file, `DOMAIN_EXPAND` | Add `convoyRaid: 3`. This expands active raid/train into bounded leaf updates instead of signing the entire route on a slow cadence. |
| `scripts/lib/eventSurfaceCensus.mjs` generated output | After the production factory imports above are in place, run `node scripts/lib/eventSurfaceCensus.mjs --forward-set` and verify `src/core/mainToSimEventSurface.js` includes `'convoyRaid:command'` in `MAIN_TO_SIM_BUS_EVENTS`. |

The view already falls back from a local runtime accessor to
`state.convoyRaid.active` on the mirrored main-thread state. Existing entity
transport includes `data.convoyRaid` and `occupantGeneration`; no custom entity
transport is required. The existing `installBusForward → laneBusEmit → BUS`
dispatch carries `{runId, type, couplerId}` without a new protocol/RPC or binding.
Keep the authority imports pointed directly at `production.js`, not `index.js`:
the latter also exports the UI view/interaction adapters, which must not be
classified as simulation emitters by the event census. Generate the forward set
after integrating the registry/factory closure, not against the unregistered
candidate. No shared bridge file has been edited in this packet.

## Ownership, numerical model and bounds

The route is a seeded curved Catmull–Rom lane with 193 arc-length samples and a
directed off-route fork. The graph supports 3–5 carriages; the production cast uses
four. IDs and the interior target are stable. The tug's anchor geometry matches
the authored Hawser proportions (`length:1.72`, `halfWidth:.26` at radius 22).
Containers use length `2 * radius` and an explicit native collider proportion.

Six compliant solver iterations exchange equal/opposite impulses at real end
anchors. Angular impulse includes the anchor lever arm. Reciprocal yaw damping
does not create net angular momentum. Severing only removes a constraint: no
position, velocity, yaw or spin is rewritten. Powered tug/attached-carriage
thrusters are explicit external forces, so the powered system is not claimed to
be closed. The `drive:false` tests isolate internal momentum conservation. A
detached component receives no route guide force. Freight has per-body
`contact.angularDamping:0` so stock payload damping does not quietly erase its
free spin. Collision response and player powers still belong to their owners.

Drive acceleration is bounded at 3.6 wu/s², attached stabilizers at 3.2 wu/s²,
coupler force at 24,000 and yaw torque at 60,000. Recovery spring force is bounded
at 900. Formation, components, couplers, command receipts and effect lists are
bounded. The production departure has 9 bodies and at most 2 one-shot raiders;
the general hard actor limit is 12. Spawn-budget slots cover the tug, escorts and
raiders. Pending player/evidence commands cap at 16 and effects at 24 per tick.
The controller reserves effect capacity for settlement. Runtime receipt history
is bounded at eight and command dedupe at 64. No wall-clock time or unseeded random
number enters gameplay.

Owner crossings are explicit:

- Existing `makeShipEntitySpec` and `makeEnemySpawnSpec` build authored ships;
  `helpers.spawnEntity`/`removeEntity` own physical lifecycle.
- Actual `combat:damage` contact evidence damages joint integrity and attributes
  defense/collateral. Both endpoints of player-controlled `tether:attached`
  (including Twin Bridle), player field hitches and successful Pull marks feed
  interference evidence. NPC attachments cannot blame the player.
- `setEntityDoctrine` keeps escort movement/weapons in the normal AI stack. Stable
  orders preserve their response-window start tick; guarding cargo does not make
  that cargo the weapon target. Private-guard retaliation is separate from WANTED.
- `lawSecurity.reportIncident` validates witnesses/jurisdiction and owns any
  resulting legal receipt. The feature never manufactures a heat receipt or
  writes WANTED. A denied report is surfaced truthfully.
- `economy:grantCredits` and `faction:repDelta` are emitted once after recording
  settlement. No direct wallet, reputation, inventory or global balance writes
  occur. Contract freight has no pickup commodity/amount and cannot auto-scoop.

## Verification and remaining acceptance

Run the focused suite from the repository root:

```sh
node --test --test-isolation=none --test-reporter=tap test/pro-five-convoyRaid.test.mjs
```

The suite uses seeds **4242** and **8191**. It verifies actual exported geometry,
solver, controller, runtime, encounter and prompt adapters. Runtime fixtures use
the real `makeEntity`, event bus, physics-authority queue/consumer and doctrine
helpers; only the omitted-catalog ship builders are injected fixtures. Assertions
cover sever continuity, linear/angular conservation, physical shock propagation,
route traversal and lawful settlement, target isolation, fork/delivery conditions,
partial/collateral losses, guards/recovery intent, bounds, command cancellation,
spawn optionality, owner impulse preservation, save staging/rebinding, recycled
IDs, missing bodies, and exactly-once rewards/consumption.

`evidence/focused-tests.txt` in the handoff ZIP records the exact final command,
runtime version, results and source-scope verification. The public index and
encounter module also import headlessly. No dependencies were installed and no
shared generators or broad audit suites were run.

This is remote source verification, not GPU/Rapier-world or Adventure acceptance.
The scoped context omits `src/data/modelTruthCensus.generated.js`, installed
dependencies and authored model binaries, preventing the full production
ships/combat/save import graph from executing here. Codex must qualify on the
complete current tree after the shared hooks above: both seeds, quiet/noisy and
Pin/Bridle separation, lawful defense, receiver loss, save/continue during a loose
chain, reduced motion/flash, and Browser/Electron's shared game route. Inspect
actual authored silhouette/anchor alignment and tactical combat behavior there.
The candidate does not duplicate Tethys `heistMission.js`, modify Massline's
ordinary strength, or change global traffic/input behavior.
