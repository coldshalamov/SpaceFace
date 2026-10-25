# Competing salvage outfits — integration contract

> Local integration: this feature is now wired into the production browser/Node registries, public interaction, save/reset, worker transport and existing presentation owners. Commission-time integration instructions below describe those seams; no feature flag is required.

Candidate base: `34310c836bf80216b869331c54b777c231a637ee`.

The commission reserves shared integration edits for local acceptance. This candidate supplies
the production owner, physical adapter, persistence, prompt/radio adapter, bounded read model,
canvas mount and ordinary encounter. The snippets below are edits for the supplied base; they
have not been applied to shared files in this candidate. No other Pro commission is required.

## 1. Register the owner and event adapter

Add these imports to **both** `src/core/registry.js` and
`src/runtime/nodeSystemFactoryTable.js`. The relative paths are the same in both files:

```js
import { salvageOutfits } from '../features/salvageOutfits/index.js';
import { salvageOutfitsPrompt } from '../features/salvageOutfits/integration.js';
```

In each file's system lookup, immediately after the existing `borrowedVoicePrompt` row, add:

```js
['salvageOutfits', salvageOutfits],
['salvageOutfitsPrompt', salvageOutfitsPrompt],
```

In `src/runtime/authoritativeSystemManifest.js`, replace the corresponding subsequences with:

```js
// PRODUCTION_INIT_ORDER
'sectorSim', 'towlineTable', 'towlineTablePrompt',
'borrowedVoice', 'borrowedVoicePrompt',
'salvageOutfits', 'salvageOutfitsPrompt', 'npcJobsRuntime', 'careerOrigins',

// PRODUCTION_UPDATE_ORDER — the prompt adapter has no tick.
'sectorSim', 'towlineTable', 'borrowedVoice', 'salvageOutfits',
'npcJobsRuntime', 'missions', 'careerOrigins', 'careerLadders',

// NEAR_CLOCK_IDS
'towlineTable', 'borrowedVoice', 'salvageOutfits', 'npcJobsRuntime',
```

Add this entry next to `borrowedVoicePrompt` in `SYSTEM_CAPABILITIES`:

```js
salvageOutfitsPrompt: Object.freeze({ nodeSafe: true, phase: 'platform', capability: 'hud' }),
```

The runtime inherits the normal gameplay capability. Do not add the prompt to an update/clock
array. The feature runs after world/encounter admission and before `npcJobsRuntime`: real towing
orders reach the job owner in the same fixed tick, and intake observes the current native line.
The near clock matches the existing NPC work owner; this is not a calendar observer.

In `src/core/runReset.js`, add these entries to `FRESH_RUN_SYSTEMS` immediately after the
existing `borrowedVoice`/`borrowedVoicePrompt` pair:

```js
'salvageOutfits', 'salvageOutfitsPrompt',
```

Use the normal registry `destroy()` lifecycle. The owner releases native lines, movement leases,
jobs and spawn reservations. Fresh-run reset clears meetings, receipts, queued terms and memory.

## 2. Generate ordinary Adventure discovery

After copying the candidate files, run:

```sh
node scripts/build-encounter-index.mjs
```

This generates the import for `src/data/encounters/8204-pro-salvage-outfits.js` in
`src/data/encounters/index.generated.js`. Browser ESM does not discover files by directory scan.
Do not add a parallel encounter registration or a forced mission/menu entry.

The shape is a civilian minor encounter with ordinary proximity admission, 480 wu firing range
and a twelve-minute cooldown. Its existing receiving markets are `station_ceres` in
`sector_ceres_belt` and `station_vesta_outlying_yard` in `sector_vesta_forge`; derelict fields,
mining belts and refinery approaches are eligible. The ordinary planner applies the sector and
zone gates. `fireReady` holds a second active meeting, and `runtime.fire` repeats that check
because the base director's readiness hold can expire. The two crews work without acceptance.

The director owns only the discovery shell. Never adopt these actors into `live.ids` or despawn
them when resolving the encounter. `salvageOutfits` owns the finite originals and crew progress;
completion resolves the shell after those originals have actual outcomes.

The scoped `discovery.js` producer also makes this work accessible on an ordinary first visit,
independent of the global calendar day or a rare weighted draw. Every half-second of simulation
time it checks the player's proximity to the existing eligible authored zones, then calls:

```js
director.requestAuthoredEncounter({
  shapeId: trigger.id,
  encounterId: chosen.encounterId,
  sectorId,
  zoneId: chosen.zone.id,
  anchor: chosen.anchor,
  respectPacing: true,
  data: {
    salvageOutfitsVariant: chosen.variant,
    salvageOutfitsDiscovery: 'authored_zone',
  },
});
```

There is no `force` option. The existing director retains eligibility, spawn admission, pacing,
telegraph and encounter lifecycle. Each seed/sector/zone has one stable finite meeting; visiting
an exhausted zone does not refill it. Another eligible zone can provide the next job after the
720-second local cooldown, provided no local meeting is still working. Each supported sector
has four eligible authored zones. The ordinary weighted shape remains another discoverable
route; the proximity producer uses the same shape and owner, not a separate loot system.
`discoverSalvageOutfits({ state, registry, helpers })` and
`salvageOutfitsDiscoveryId(state, zoneId)` are exported from the scoped producer. The runtime
already calls it; there is no extra shared tick to install. Authored zone order cycles
`split_drift`, `heavy_lift` and `overreach`, and the encounter passes that saved variant to
`salvageOutfits.start()` when the director fires it.

## 3. Save every capture path and restore after the existing owners

The saved subtree is `data.salvageOutfits` with feature `schema: 1`. The central save envelope has
two independent capture definitions whose insertion order must remain identical.

In `src/save/saveSystem.js`, insert the new row immediately after the existing `salvage` row in
`_saveCapturePlan()`:

```js
['salvage', () => this._callSerialize('salvage') || {}],
['salvageOutfits', () => this._callSerialize('salvageOutfits')],
```

In `_serializeDataSteps()`, use the same relative key position:

```js
data.salvage = this._callSerialize('salvage') || {};
yield 'serialize:salvage';
data.salvageOutfits = this._callSerialize('salvageOutfits');
yield 'serialize:salvageOutfits';
```

This covers synchronous `serializeData()`, frozen async capture and autosave. Keeping the source
snapshot before economy/world/entities capture preserves coherent pools and settlement receipts.
Do not serialize the UI adapter or persist numeric entity IDs as durable body identity.

In the shared restore generator, immediately after the existing salvage deserialize, add:

```js
this._callDeserialize('salvageOutfits', data.salvageOutfits);
yield 'salvage-outfits-restored';
```

This step normalizes records only. **Do not add `afterContinue()` beside the earlier named-NPC
after-continue calls.** The base save generator restores `npcJobsRuntime` later, after first
world materialization and combat/native restoration. Rebinding outfit jobs before that late
deserialize would discard the new jobs. The feature already subscribes to `save:loaded`, which
is its post-restore materialization/rebinding handoff. No additional shared call is needed.

For callers building an envelope outside `saveSystem`, concrete ports are exported from
`src/features/salvageOutfits/integration.js`:

```js
import { captureSalvageOutfits, restoreSalvageOutfits }
  from '../features/salvageOutfits/integration.js';

data.salvageOutfits = captureSalvageOutfits(state, registry);
restoreSalvageOutfits(data, registry); // the WHOLE envelope, not the subtree
```

These are alternatives for an explicit host/harness, not extra production calls. Preserve the
normal `save:restoring` → normalize/core restore → `save:loaded` sequence.

### Envelope migration

`src/data/saveVersion.js` is the actual central version source; `src/save/migrations.js`
re-exports it. When integrating this candidate directly on the supplied base, change:

```js
export const CURRENT_VERSION = 20;
```

In `src/save/migrations.js`, import:

```js
import { freshSalvageOutfits } from '../features/salvageOutfits/persistence.js';
```

Append one entry to `MIGRATIONS` after the existing `18 → 19` entry:

```js
{
  from: 19,
  to: 20,
  fn(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    if (!Object.hasOwn(data, 'salvageOutfits')) data.salvageOutfits = freshSalvageOutfits();
  },
},
```

When collecting several changes into one local envelope bump, coordinate one migration for that
version; do not create duplicate `from` entries. The feature's own normalizer remains the shape
and bounds authority, and a missing subtree always means a fresh feature bag.

Unaccepted callbacks are discarded at save boundaries. A regenerated offer advances the saved
revision, so an old callback cannot accept new terms. Accepted agreements retain their quoted
bonus; depleted pools, exact body keys, actor poses, memory and settlement receipts persist.

## 4. Whole-sim worker boundary

### Forward the choice intent through the generated surface

`src/core/mainToSimEventSurface.js` is generated, so do not hand-edit its event set. The base
census uses import membership plus a fixed presentation-directory rule; this feature's adapter
lives in `src/features` and is imported in both realms. Add this explicit reviewed entry to
`DYNAMIC_FORWARD` in `scripts/lib/eventSurfaceCensus.mjs`:

```js
{
  type: 'salvageOutfits:choose',
  emitters: ['src/features/salvageOutfits/presentation.js'],
  note: 'promptDeck callback executes on main; feature adapter is imported in both realms',
},
```

Then regenerate:

```sh
node scripts/lib/eventSurfaceCensus.mjs --forward-set
```

The resulting `MAIN_TO_SIM_BUS_EVENTS` must contain `'salvageOutfits:choose'`. Its payload is
only `{ meetingId, offerId, choiceId, source }`. The runtime revalidates the exact live offer,
distance, source pieces and agreement before committing. No start/debug event is exposed.

### Mirror durable labels and current runtime bindings

In `scripts/lib/simReadModel.mjs`, add this whole-root entry in `DOMAIN_MIRROR_KEYS`, next to
the other bounded gameplay read models:

```js
'salvageOutfits',
```

Add these properties to the respective existing object literals:

```js
// DOMAIN_EXPAND — one bounded meeting per leaf, rather than one cold growing history bag.
salvageOutfits: 2,

// DOMAIN_CADENCE — physical movement still arrives through the entity journal.
salvageOutfits: 10,
```

The mirror is live state, not the on-disk serializer: current `entityId` and `generation` are
needed to join records to the entity journal. The read model verifies both the stable
`data.salvageOutfitKey` and the current occupant generation, then reads live poses. A continuous
sector membership change does not hide still-present originals. A home-different meeting is
eligible only when an exact current original is present; rehydrating an offer also requires the
player within the 650 wu range. An absent historical record cannot create a marker or a body.

### Outgoing events and the one voice floor

`scripts/lib/simWorkerHost.mjs` already captures all emitted production events. The plain-data
`salvageOutfits:offer`, `salvageOutfits:offerClosed`, and `salvageOutfits:radio` payloads fit the
four-level generic projection in `scripts/lib/simEventBridge.mjs`; there is no outgoing allowlist
or per-type adapter to add. Offer choices contain no functions or entity references.

The base registry initializes node-safe systems only in the worker when `ctx.simLane ===
'worker'`. That includes `voiceArbiter` and the registered `salvageOutfitsPrompt`. In that realm,
the adapter has no prompt deck, but queues radio through the installed `helpers.voice.say`
port. This keeps its `valid()` predicate inside the voice owner rather than on the wire. Only
the matching `voice:surface` produces `barkDirector:voice`, already consumed by existing audio.

The main UI mount below handles prompt cards on the worker lane and disables its duplicate
radio producer. Preserve `ctx.simLane` when mounting. In the single-realm lane, the registered
adapter handles both prompts and the same voice floor. Do not add a second radio/toast producer,
forward `voice:say`, or call a nonexistent worker facade for `salvageOutfits`.

## 5. Mount the concrete UI adapter

In `src/ui/uiRoot.js`, add:

```js
import { mountSalvageOutfitsPresentation } from '../features/salvageOutfits/integration.js';
```

In `ui.init(ctx)`, immediately after the existing `this.promptDeck = createPromptDeck(ctx)`, add:

```js
this.salvageOutfitsPresentation?.destroy();
this.salvageOutfitsPresentation = mountSalvageOutfitsPresentation({
  ...ctx,
  root: document.getElementById('ui-root'),
});
```

In `ui.frame(dt, state)`, beside `capitalBossOverlay.draw(st)` and before `promptDeck.tick()`, add:

```js
this.salvageOutfitsPresentation?.draw(st, hudVisible);
```

In `ui.destroy()`, before destroying the prompt deck, add:

```js
this.salvageOutfitsPresentation?.destroy();
this.salvageOutfitsPresentation = null;
```

The supplied mount owns a transparent, pointer-inert 2D canvas under the existing UI root. It
uses `helpers.worldToScreen` from the gameplay camera, handles root offsets and DPR, and observes
resize outside the frame loop. Text stays 12 CSS pixels on high-DPR screens. The host owns frame
cadence and the existing HUD visibility decision. The mount adds no animation loop, controls,
keyboard listeners, stylesheet dependency or gameplay writes.

The installer is idempotent per bus and republishes current owner-produced terms after the
prompt deck exists. It also listens to save completion, sector entry and undock; scanning a crew
asks the owner to offer current terms again. Prompt-deck retains pointer/digit/Escape/gamepad
ownership, with explicit refuse and cancel choices.

Keel's double-bar mark and Latchkey's twin chevrons distinguish crews without color. Dashed
lines describe intent before attachment; solid lines describe towing. Cargo shows its claim in
text, and the receiving apron marks the physical slow-arrival destination. The bounded view
prefers active work over completed sites and uses live pose slots. Cues introduce no flashing,
shake or decorative animation; existing hulls, propulsion and native ropes provide motion.

For a host that already owns a suitable 2D canvas, `installSalvageOutfitsPresentation(ctx)` and
`createSalvageOutfitsOverlay(...)` remain available. Use one mount path. The shared UI snippet
above is the complete production hookup and requires no additional render-system edit.

## 6. Generate indexes and qualify the integrated result

After the shared edits, regenerate their existing documentation and encounter graph:

```sh
npm run build:indexes
npm run generate:save-schema
node scripts/lib/eventSurfaceCensus.mjs --forward-set
```

This updates the existing generated `docs/SYSTEM_REGISTRY.md`, `docs/EVENT_ROUTING.md`,
`SAVE_SCHEMA.md`, encounter/flavor indexes and main-to-sim event surface. Do not hand-edit those
outputs. The focused candidate test invocation used in this environment is:

```sh
node --test --test-isolation=none --test-concurrency=1 test/pro-experiences-salvageOutfits.test.mjs
```

For shared seam acceptance, the base provides these focused checks:

```sh
node --test --test-isolation=none --test-concurrency=1 test/authoritative-manifest.test.mjs test/save-envelope-fidelity.test.mjs test/event-surface-optional-chain.test.mjs test/sim-read-model-identity.test.mjs test/depth-program-encounter-loader.test.mjs
node scripts/build-encounter-index.mjs --check
npm run check:save-schema
```

The candidate test uses explicit real simulation/native/economic owners because shared imports
are reserved for integration. It is not a claim that the unchanged base registry is wired.
Cold-restore evidence must compare a partially towed original, depleted source pool, accepted
agreement and settled receipt against uninterrupted progress. Crew timers alone cannot award
loot: native handover and the existing economic writer decide settlement.

Native snapshot renders exercise the actual cue adapter and distinguish approach from a loaded
line. Full Adventure camera-scale art, prompt styling, browser worker play and real input feel
remain integration acceptance checks: the supplied source archive omits binary assets and the
shared stylesheet graph. Diagnostic hull outlines are not production-art evidence.
