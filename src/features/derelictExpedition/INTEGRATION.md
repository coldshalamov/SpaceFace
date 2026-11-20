# BLACKBOX RUNS — source candidate integration

## Disposition and source contract

This is an executable source candidate for Codex to integrate and accept on the current local tree. The feature, production system adapter, encounter adapter, physical layout/choreography, presentation host, and focused tests are implemented. Shared registration, save-envelope wiring, generated discovery, worker presentation wiring, native physics qualification, and Adventure player acceptance remain with Codex, as required by the commission.

| Identity | Value |
| --- | --- |
| Task | `derelictExpedition` / BLACKBOX RUNS |
| Repository | `coldshalamov/SpaceFace` |
| Exact source base | `45a97fdbda62611cc13001bd16790f8afa844753` on `master` |
| Requested result branch | `codex/pro-five-derelictExpedition-20261022` |
| Context mode | `remote-plus-upload` |
| Local working state | `UNPUSHED_LOCAL_STATE: NOT AVAILABLE TO CHATGPT` |
| Input archive | `spaceface-45a97fdb-context.zip` |
| Verified input SHA-256 | `af7c8aa1f48ba55d1c855f9ce4ef540d05513fff9c6dbad113cf246ac0082724` |

The archive checksum and `HANDOFF_CONTEXT.json` repository/base identity were checked before implementation. The upload is a scoped source snapshot, with 7,987 included inventory entries and 533 omitted entries; it contains no Git object database, installed dependencies, runtime models/audio, or files over its size limit. The requested branch name above is a transport target, not a claim that a remote branch or commit exists. Use the delivered `manifest.json` for the actual result-branch/result-commit disposition and file hashes.

All source changes are confined to the packet's exclusive write scope:

- `src/features/derelictExpedition/**`
- `src/data/encounters/8102-pro-five-derelict-expedition.js`
- `test/pro-five-derelictExpedition.test.mjs`

No shared registry, engine, save owner, index generator, generated catalog, renderer, UI root, dependency manifest, global status document, or master branch was edited. The shared edits described below are deliberately local closeout work. Apply against the exact base, then reconcile the current local tree; the candidate cannot account for unavailable unpushed work.

## What is implemented

Morrowglass is one finite wreck in `sector_vesta_forge`, with its site origin at sector-local `{ x: 1660, z: -1600 }`, rotation `-0.28`, resolved to global coordinates through `sectorLocalToGlobalForSector`. It is separated from the Helios starter sector. The encounter offers entry only while the ship is in Vesta and within 1,350 world units of the authored entrance. Acceptance checks the ship against all proposed body footprints before materialization; it can ask the player to move clear rather than create hardware on top of the ship.

Three connected holds share a wide exterior return lane. Three authored variants (`split_keel`, `shear_step`, `hooked_stern`) receive bounded seeded offsets, debris placement, and dimensions. Regenerating with the saved seed and explicit selected variant reproduces the original layout exactly. There are 36 authored bodies, under a hard layout cap of 40; the runtime materializes at most eight per attempt. The six pressure fragments and six return-rack fragments are finite stock. There is no continuing debris spawner.

| Physical problem | Implemented solutions and consequences |
| --- | --- |
| Counterweighted shutter | Move the weight with Massline/Pull/Shove/Rig or another physical interaction to assist rotation; displace or rotate the actual shutter enough to clear access; ordinary damage can destroy the shutter. A bounded torque motor and loaded bearing produce movement through `physicsAuthority`. |
| Pressure hold | Pull/tow/shove its baffle at least 27 units off its loaded mount, or destroy that payload with ordinary guns/Bomb damage. The jet has a fixed warning and quiet-window schedule. Disabling the real baffle stops the jet. |
| Optional relay vault | Displace the relay at least 29 units, destroy the relay, or destroy the vault gate. Cutting relay power drives the actual gate toward its open position with a bounded motor. |
| Cargo mounts | Both cargo bodies begin on real `attachment_salvage_clamp` attachments to nearby authored cradles. Cleared machinery releases the relevant clamp. Physically breaking a clamp and towing the cargo out is also valid; a bypass does not silently turn off machinery that remains intact. |
| Return | Tow the physical load back to the exterior receiver. The inner shortcut receives two finite warned releases of loose plating. The outer lane remains the designed escape route. Pin/Rig/other stock powers can manage moving pieces; the feature adds no key bindings or special interaction menu. |

The flight recorder is the primary objective; the heavier reactor memory core is optional. Delivering the recorder establishes `primaryComplete` and phase `extracted`, even while the core remains in the wreck. The player may leave at that point. A separate physical return and separate reward are required for the core. Losing one cargo item does not erase an already delivered item or its payment; a surviving core remains recoverable even if the recorder was lost.

The receiver requires a live recovered body inside its 26-unit radius, speed at or below 10 units/second, and the player's ship within 116 units. Settlement needs 2.5 seconds of observed dwell. A high-speed crossing, distant unattended cargo, synthetic body report, elapsed-time jump, or partially observed dwell restored from a save cannot settle a load. Delivered bodies are removed through the core entity helper and retain terminal custody records.

Pressure rises with simulation time and physical progress, capped at 100; thresholds 25/50/80 change its stage. It continues to rise while an accepted unfinished site is abandoned or off-sector during active flight. It does not advance while the game is paused or outside flight. Pressure increases the cost of the inner return, never creates a countdown-to-death or a timer-only win. The live choreography currently uses a 26-second jet period unless an explicit layout period is supplied, with a 3.5-second warning and 2.5-second active pulse. The first return rack becomes eligible when the recorder is recovered or after 240 expedition seconds, whichever comes first; the second uses core recovery or 420 seconds. This makes a fast physical return change too. Each rack receives a fresh five-second local warning before its single normalized 5-units/second release impulse, including after reentry. These are source tuning values, not evidence of an accepted 8–12 minute playthrough.

## Public modules and APIs

Import the public surface from `src/features/derelictExpedition/index.js`. It has no registration side effects. Keep the authoritative system in the sim realm and the DOM host in the presentation realm.

| Module | Responsibility |
| --- | --- |
| `layout.js` | Seeded three-variant geometry, authored body descriptors, corridor clearance checks, coordinate transforms. |
| `model.js` | Plain durable site record, physical custody, pressure, phase changes, restore normalization, reward intents. No Three.js, bus, DOM, or wall clock. |
| `choreography.js` | Pure bounded machine/jet/release plans and mass-scaled impulse calculation. |
| `runtime.js` | Real core spawn/remove helpers, measured body observations, combat attachment service, physics command membrane, economy owner, sector/save lifecycle. |
| `site.js` | Fixed Vesta site descriptor and canonical layout reconstruction. |
| `encounterRuntime.js` | Exact director `fire / choose / tick` invitation contract. Owns no expedition entities. |
| `presentation.js` | Real authored asset mapping, objective/marker projection, accessible tells and existing cue recipes. |
| `hud.js` | Low-chrome ORRERY text/pressure instrument, bounded screen-space wayfinding, optional route display. Reads presentation only. |
| `8102-pro-five-derelict-expedition.js` | Deliberate optional encounter trigger, choices, receipts, and runtime export. |

Create one production instance per game state:

```js
import {
  createDerelictExpeditionSystem,
  BLACKBOX_RUNS_SITE,
  createDerelictExpeditionHud,
} from '../features/derelictExpedition/index.js';

const expedition = createDerelictExpeditionSystem();
// The registry owns these calls; do not also call them from the encounter.
expedition.init({ state, bus, helpers, registry });
expedition.update(dt, state);
```

The instance name is exactly `derelictExpedition`. `init` installs `helpers.derelictExpedition` with `start(siteId)`, `resume(siteId)`, `abandon(siteId)`, `getStatus(siteId)`, and `presentation()`. `start()` defaults to `blackbox_vesta` and resumes an existing accepted site instead of replacing it. Commands return `{ ok, reason? }`; the encounter handles actual refusal reasons. `getStatus()` returns cloned record/layout/mechanics and entity IDs for diagnostics. `presentation()` returns the bounded read-only display projection, or `null` before acceptance. `serialize()`, `deserialize(data)`, and `newGame()` are the persistence/reset hooks. `dispose()` releases subscriptions and its own helper binding; `destroy()` delegates to it for registry teardown. Prefer the factory over sharing the exported singleton across separate game states or fixtures. The public index also exports `BLACKBOX_RUNS_ENCOUNTER`, `BLACKBOX_RUNS_TRIGGER`, and `BLACKBOX_RUNS_ENCOUNTER_ORDER` for deliberate catalog access.

## 1. Register the authoritative owner

The exact shared owners at the supplied base are:

1. `src/core/registry.js`: import `createDerelictExpeditionSystem` and add `['derelictExpedition', createDerelictExpeditionSystem()]` to `buildRegistrySystemLookup`.
2. `src/runtime/nodeSystemFactoryTable.js`: add the same factory-backed lookup entry in `getNodeSystemFactoryTable`, so the Node and whole-sim worker routes construct the production adapter.
3. `src/runtime/authoritativeSystemManifest.js`: add the ID to `PRODUCTION_INIT_ORDER`, `PRODUCTION_UPDATE_ORDER`, and **exactly one** clock declaration, `TABLE_CLOCK_IDS`.
4. `src/core/runReset.js`: add the ID to `FRESH_RUN_SYSTEMS` before `world`, alongside the durable salvage owners, so canonical New Game reset clears the ledger before world entry. The runtime also handles the existing `game:newGame` event; its reset is idempotent.

Recommended init position is immediately before `encounterDirector`: `core`, `physics`, `actions`, `combat`, `economy`, and `world` are initialized by then, and the helper is installed before an invitation can fire. Recommended update position is immediately before `physics`, beside the other anchored machinery owners. This lets queued impulses participate in that fixed step's native solve; measured progress is based on the previous settled body observation. Do not put the feature on the 2 Hz calendar clock: its motor/dwell/force budget requires fixed table steps. The runtime ignores duplicate calls for the same `state.tick`, but that guard is not a second scheduling mechanism.

The system is Node-safe. No DOM capability declaration or new HUD system ID is needed for `runtime.js`. Keep the HUD factory out of the manifest's import-pure implementation. The common registry teardown calls the implemented `destroy()` hook, which disposes the helper and subscriptions. Do not initialize or advance a second authoritative instance on the presenting thread when the whole-sim worker owns this ID.

## 2. Make the authored encounter discoverable

The allowed encounter module exports `encounterOrder = 8102`, `trigger.id = 'blackbox_runs'`, and `runtime = BLACKBOX_RUNS_RUNTIME`. The director's `SELF_REGISTERED_SCRIPTS` map is built from `ENCOUNTER_MODULES`; importing the module directly in a test is not production discovery.

The source candidate originally used an uppercase filename that the existing encounter generator excludes. Local integration renamed it to `8102-pro-five-derelict-expedition.js` and updated the owned imports. The unchanged lowercase generator now discovers it normally. Regenerate and check `src/data/encounters/index.generated.js` with `node scripts/build-encounter-index.mjs` and `node scripts/build-encounter-index.mjs --check`.

Local integration also authored `Masks.PROJECTILE` on the new movable payload specs. Without it, ordinary production projectile sweeps skipped the machinery even though direct damage tests passed. The added regression reproduced that failure, then passed against the existing sweep and native bodies. The full local focused suite passes 39 tests with no loader.
The trigger is ambient/civilian, `zoneTypes: ['derelict_field']`, `gates.sectorIds: ['sector_vesta_forge']`, with a 300-second cooldown. Its runtime adds the stricter site-entrance proximity check. `fire` asks for `enter` or `decline`, with a 90-second offer timeout defaulting to decline. `choose` calls the installed helper's real `start()` and resolves immediately; `tick` only times out an unanswered offer. It never adds the expedition bodies to `live.ids`. This matters because director resolution/despawn must not erase accepted cargo or scenery.

Do not add the wreck to starter spawn or start it automatically from system initialization. Before acceptance there are no feature bodies and no pressure clock. Existing encounter choice UI is the player decision surface; the feature HUD does not add a duplicate accept/abandon menu.

## 3. Add the save-envelope field and preserve physical identity

The feature's envelope field is `data.derelictExpedition`, whose value is:

```js
{
  schemaVersion: 1,
  sites: {
    blackbox_vesta: {
      record: { /* normalized plain record, own schemaVersion: 1 */ },
      mechanics: {
        clamps: { blackbox: { released: false }, core: { released: false } },
        collapseReleased: { rack_one: false, rack_two: false },
        collapseArmedAt: { rack_one: null, rack_two: null },
        notices: {}, lastVentWarningCycle: -1, ventApproached: false,
      },
    },
  },
}
```

An unstarted save uses `{ schemaVersion: 1, sites: {} }`. A malformed existing ledger is quarantined, not interpreted as a new loot source. `deserialize(undefined)` is the supported additive default for saves predating this feature. Always call the deserializer, even when the field is absent, so loading an old slot cannot retain the previous slot's accepted wreck.

In `src/save/saveSystem.js`, add the same field in both capture paths, maintaining identical key order:

```js
// _saveCapturePlan(), beside the durable physical-play/salvage owners
['derelictExpedition', () => this._callSerialize('derelictExpedition')],

// *_serializeDataSteps(), at the matching position
data.derelictExpedition = this._callSerialize('derelictExpedition');
yield 'serialize:derelictExpedition';
```

Capture the feature before `world` and `entities`, alongside the other durable salvage owners. Its serializer records current body measurements before producing plain data. The existing coherent/frozen save boundary must include player credits, economy, the feature ledger, persistent entity rows, combat attachments, and native physics together. Do not save its reward ledger independently on another timer.

In the existing restore sequence, add:

```js
this._callDeserialize('derelictExpedition', data.derelictExpedition);
```

Place this beside the other durable source deserializers, **before** `world` enters the restored sector and before step 10 `_spawnPersistentEntities` and step 12 `_restoreCombatSteps`. The feature listens to `save:restoring`, suspends measured live custody and removes its outgoing bodies, then suppresses spawning while restore is active. Its `deserialize()` must run before the saved physical actors are reconstructed; calling it after reconstruction would let outgoing cleanup delete newly restored cargo. `save:loaded` releases the barrier and adopts restored bodies. An aborted restore followed by `save:error` releases the barrier and resumes the preserved pre-restore measurements.

Keep the ordinary persistent entity/native physics/combat representation. Feature bodies carry `flags.persistent`, `data.persistenceOwner = 'derelictExpedition'`, and `data.derelictExpedition = { siteId, key, role }`; the existing `_serializeEntities` and `plainEntity` retain these. The feature record is the custody/outcome authority, while the generic save carries the physical actors and native/player-tether relationships. This is one physical reconstruction with one ledger, not two spawn owners.

After generic persistent reconstruction and combat attachment remapping, `_layout()` adopts valid living bodies by persistence owner/site/body key. It rejects extra duplicates, terminal bodies, and recycled numeric IDs with a different `occupantGeneration`; `_adoptClampBindings()` finds existing own clamps by their deterministic `actionInstanceId`. While restore is active, public status/presentation reads reconstruct only a pure layout and cannot adopt a partially restored actor set. `save:loaded` clears the runtime cache before adopting the complete final set. Missing eligible unspawned/suspended bodies can then materialize within the budget. A released/recovered cargo body does not need a surviving old cradle or attachment service to restore; only a still-clamped load waits for those endpoints. Do not filter these bodies out of `data.entities.persistent` without designing the matching native physics and active Massline reference remap: merely excluding them loses the saved tow. Confirm native joint adoption and the active player tether on the real restore path during local closeout.

The plain ledger stores bounded seed/variant/origin, elapsed pressure, each obstacle's physical proof, body pose/velocity/integrity/lifecycle, cargo custody, and at most two reward rows. Serialization contains only plain values, including numeric entity IDs as observations; restore normalization clears those IDs and changes live rows to suspended before adopting the remapped physical actors. A missing live body is a `lost` tombstone; an intentional sector/save unload produces `suspended` state. Neither reentry nor reload resets a loss or delivery. Clamp and rack-release receipts survive; a not-yet-consumed rack earns a fresh warning rather than firing silently on reentry. Partially observed receiver dwell resets on restore.

Use the current tree's save schema owner: `src/data/saveVersion.js` is version 18 at the supplied base. Allocate the next current version after local reconciliation, append a pure rerunnable migration in `src/save/migrations.js` for the additive field/default, regenerate `SAVE_SCHEMA.md` through its existing script, and run the targeted save/schema checks. Do not edit the generated schema document by hand or assume no other local branch has already advanced the version.

### Reward transaction boundary

Recorder and core base rewards are 900 and 1,400 credits. Actual payout is `floor(baseReward * (0.35 + 0.65 * deliveredIntegrity))`. A destroyed/missing item has no settlement. Delivery creates a stable intent ID `blackbox_vesta:blackbox` or `blackbox_vesta:core`; a repeated observation cannot create another intent.

`runtime._settleRewards()` requires the registered `economy` object, its `grantCredits(amount, reason)` method, and matching `economy.state`. With no writer, the intent stays pending. A listener on `economy:grantCredits` is not accepted as proof that a credit writer exists. The runtime marks the intent committed and directly calls that existing synchronous economy owner, which remains the sole writer of player credits. No cargo inventory, faction reputation, or WANTED heat is modified by this feature.

This gives at-most-once settlement under the repository's synchronous owner/coherent-save contract. The economy API has no durable transaction-ID acknowledgement. A failure between committing the receipt and applying credits could underpay; retrying such a marked receipt would risk duplicate payment. The candidate does not claim a distributed exactly-once transaction protocol. Keep both sides in the existing save transaction and validate success/restore around delivery on the actual local owner.

## 4. Mount the HUD on the existing presentation host

Use `src/ui/uiRoot.js`, beside its existing `capitalBossOverlay`/physical venue mounts. Construct after `#ui-root` exists and after the registry provides the system. Dispose the previous instance on remount and in `uiRoot.destroy()`/its existing overlay teardown.

```js
this.derelictExpeditionHud?.dispose();
this.derelictExpeditionHud = createDerelictExpeditionHud({
  root: document.getElementById('ui-root'),
  system: this.ctx.registry.get('derelictExpedition'),
  helpers: this.helpers,
});
```

The factory mounts once and returns `{ element, mount, update, dispose, setRouteVisible }`. It owns no timer or animation loop. From the existing UI frame owner, accumulate presentation `dt` and call `update` at 4–10 Hz (for example every 0.125 seconds). Use that owner's existing `hudVisible` gate, plus the correct sector. Hide immediately when the gate changes; do not wait for the next low-cadence repaint to hide it:

```js
const visible = hudVisible
  && st.world?.currentSectorId === BLACKBOX_RUNS_SITE.sectorId;
this._derelictHudElapsed = (this._derelictHudElapsed || 0)
  + Math.max(0, Number.isFinite(dt) ? dt : 0);
if (!visible) {
  this.derelictExpeditionHud?.update({ visible: false });
  this._derelictHudElapsed = 0.125;
} else if (this._derelictHudElapsed >= 0.125) {
  this._derelictHudElapsed = 0;
  this.derelictExpeditionHud?.update({ visible: true });
}
```

The host already computes `hudVisible` from flight mode, modal chrome, and docking. Reuse it rather than create a competing global HUD gate. A completed site's projection can remain as its receipt or be hidden by the host's chosen visibility policy. Before acceptance `presentation()` returns `null`, so the HUD is hidden.

The real projection contract, also used by `src/ui/capitalBossOverlayMount.js`, is:

```js
helpers.worldToScreen({ x, y: 0, z }, reusableScreenOutput);
// => { x, y, onScreen } in window CSS pixels, or fills the output object
```

The adapter reads the current helper on each projection, subtracts the root's viewport offset, caches root geometry with `ResizeObserver`, and edge-clamps offscreen arrows. It draws at most three SVG marker labels and at most 12 route points. These are navigation marks for the actual authored bodies, not replacement geometry. Its optional `Show outer route` button only toggles local presentation, is keyboard accessible, and contains its input propagation. It adds no gameplay bindings.

The instrument reuses ORRERY `--dp-*` tokens and the existing arc/tick helpers. Objective, pressure stage, number, hint, shape, and text remain legible without color. Reduced motion/flash/high-contrast preferences come from the production projection; the host itself has no flashing or animated warning. Runtime captions use existing `comms:log`/`toast`, and the limited VFX events use real `presentation:cue` recipes (`salvage.cooker.tracked`, `wreck.scavenge.cut`, `mining.yield.collected`). Authored bodies use existing aftermath GLBs, `packagedPropFile`, and the existing cargo-container payload asset; no new media or renderer fallback shape is supplied.

### Whole-sim worker presentation

The main-thread registry deliberately does not return live sim-owned objects in worker mode. At this base the exact seams are `src/core/registry.js::laneSystemFacade`, `scripts/lib/simReadModel.mjs::DOMAIN_MIRROR_KEYS` and its bounded domain projector, and the transport in `src/core/simLaneMain.js`.

For that route, publish a bounded presentation-only projection from the worker and mirror it through the existing domain read model; expose a `derelictExpedition` facade whose `presentation()` returns that mirrored value. Pass the facade to this same HUD factory. Do not call `init` on a UI-side system or mutate a mirrored record to start a run. The invitation already executes in the authoritative director and calls its worker-local helper, so it does not need a new DOM command. If the local UI later exposes resume/abandon, route those through the existing allowlisted command channel and authoritative helper; the delivered HUD contains no such controls. Native meshes remain on the ordinary entity journal. This worker display hookup has not been exercised in the scoped VM candidate.

## Focused verification and provenance

The frozen focused suite passed **38 tests, 0 failures, 0 skipped** after the final lifecycle fixes. The delivered `evidence/focused-tests.txt` is the command output. From a complete checkout with its existing dependencies and generated data:

```sh
node --test --test-isolation=none test/pro-five-derelictExpedition.test.mjs
```

The exact VM command was:

```sh
node --import ../test-support/census-loader.mjs --test --test-isolation=none test/pro-five-derelictExpedition.test.mjs
```

The external read-only loader was needed because two generated source dependencies exceed the archive's size limit. It redirects their original imports to copies fetched from the exact commissioned base, with these verified identities:

| Original dependency | Bytes | SHA-256 |
| --- | ---: | --- |
| `src/data/modelTruthCensus.generated.js` | 2,525,520 | `f704a3afb9de11243c007a3c4d1f1e51bb7747bcfa982c2d40116c6b0fbfdf13` |
| `src/localization/catalogs/en-US.generated.js` | 2,010,603 | `304140bde901d9d78f8d7ffdad6bcfe50d884e51c49597481f15aa26a8986f30` |

The loader and fetched unchanged files are outside the candidate, not new project dependencies or replacement data. A full checkout needs no loader. The suite executes the actual core entity owner, economy owner, damage handling, attachment service, encounter director, and physics command membrane. Its small native attachment bridge is a contract test port. Fixture movement supplies measured positions/velocities to exercise observations; this is not a native Rapier solve or a player performing the tow.

Coverage includes both seeds 4242 and 19837, all three authored variants, orientation transforms, deterministic restore, swept corridor width and obstruction rejection, physical extraction and optional second settlement, receiver speed/proximity/dwell requirements, absent/malformed measurements, missing cargo and recycled IDs, save/abandon/reentry custody, failed-restore recovery, released cargo with a lost cradle, status reads between generic restore chunks, missing attachment/economy owners, reward idempotence, real damage/displacement/clamp-break alternatives, bypass without disabling an intact jet, bounded force commands, recovery-triggered rack warnings, fresh collapse warning and finite once-only release, authentic authored asset IDs, accessibility projection, director resolve ownership, decline/timeout, and HUD marker placement. Additional lightweight DOM verification exercised the HUD's mount/update/dispose lifecycle, keyboard containment, route toggle, offset handling, cached sizing, hidden gate, and read-only projection behavior.

Geometry checks certify a 22-unit swept-disc half-width along the authored corridor centerlines, including body collision envelopes, with no initial overlaps. Interior checks allow the explicitly declared movable blockers; the exterior check includes all initial bodies. This proves meaningful static towing clearance for that envelope. It does not certify every possible ship/load configuration, native mesh/collider fit, or arbitrary debris rearrangement by the player. Runtime protection exempts the exterior from the jet and steers owned fragment stock inward through bounded impulses; it does not teleport cargo, suppress collisions, or erase player-authored momentum.

## Local acceptance boundary

The remaining work is concrete shared integration and qualification, not replacement implementation:

- Register one system in both lookup tables, the authoritative manifest/table clock, and canonical New Game reset; ensure normal registry teardown invokes cleanup.
- Regenerate the static catalog with the lowercase encounter filename, and verify the normal Vesta approach/decline/accept path through the existing prompt UI.
- Add the feature save field in both capture paths and its early restore hook, migrate the current envelope version, and validate active native Massline/clamp identity across save/load with the standard persistent/combat/native restore.
- Mount/dispose the supplied HUD under the existing flight gate and connect the existing worker mirror/facade if that is the active host route.
- Run the focused suite on the complete local checkout, then perform native Rapier and Adventure acceptance: physical weight/shutter response, both baffle solutions, optional relay/core, main-only extraction, damaged load return, abandon/reentry, failure/restore, and two separate payments. Check normal top-down legibility and accessible settings while the authored GLBs and actual colliders are loaded.
- Measure the requested 8–12 minute experience through a genuine player run. The source's pressure and geometry are implemented; pacing, cargo handling feel, camera clearance, exact collider dimensions, full worker behavior, GPU performance, browser/Electron acceptance, and player truth are not claimed by the VM evidence.

The downloadable source candidate is the remote deliverable if no result branch push is available. Its ZIP contains `manifest.json`, `files/<allowed repo-relative paths>`, and `evidence/focused-tests.txt`; include `candidate.patch` only when an exact Git object base is available. The manifest records schema version 1, task/base/result identity, changed paths, per-file hashes, author, and creation time. It must not contain dependencies, caches, secrets, Git metadata, unrelated source, or the full repository. Codex owns final review, narrow local integration fixes, acceptance, and any eventual commit/push.
