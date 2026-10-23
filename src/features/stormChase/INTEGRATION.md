# GLASSWAKE — source candidate and local integration

## Disposition and provenance

This is the remote implementation candidate for task `stormChase`. Codex owns integration into the current local tree, review, Adventure player-truth acceptance, and the accepted feature commit. The candidate intentionally does not edit shared registry, save, mirror, renderer, generated catalog, status, or balance files.

- Repository: `coldshalamov/SpaceFace`.
- Exact base: `45a97fdbda62611cc13001bd16790f8afa844753`.
- Requested result branch: `codex/pro-five-stormChase-20261022`.
- Context: remote-plus-upload; no unpushed local state was available.
- Verified input ZIP SHA-256: `af7c8aa1f48ba55d1c855f9ce4ef540d05513fff9c6dbad113cf246ac0082724`.
- `HANDOFF_CONTEXT.json` identifies the same repository, master, and exact base. The archive excludes dependencies, runtime art/audio, Git metadata, and large generated files.

All candidate source is under `src/features/stormChase/`, plus `src/data/encounters/8104-pro-five-stormChase.js` and `test/pro-five-stormChase.test.mjs`. The transport manifest lists exact file hashes. There are no new dependencies or new model assets.

## Playable core

The optional expedition starts from Vesta Forge's outer Dead Freighter approach, near sector-local `(1500, -1650)`. `sectorLocalToGlobalForSector` converts this into the actual global world frame. The starter sector cannot offer or start it. A pilot inside the future storm rim is asked to move clear before a course is admitted. Decline and offer timeout have no fee and spawn no weather or bodies.

The player chooses one of three finite courses:

| Course | Storm duration | Initial forecast | Character |
| --- | ---: | ---: | --- |
| Lee Arc | 176 s | 10 s | Long bend, both fronts carry in the same direction |
| Cross Shear | 196 s | 12 s | Opposing currents along an S-shaped route |
| Return Hook | 214 s | 14 s | A hooked route and faster outer current |

Each course has a moving force-free eye, two breathing and rotating fronts, periodic common ingress gaps, three sampling pockets, and a permanent wide escape during its final dissipation. Forecasts sample the same deterministic controller eight seconds ahead; they do not predict with a separate motion model. All clocks are `state.simTime`, with a seeded phase schedule. Geometry survives serialization exactly.

Eight real wreck bodies enter the current. Two heavy authored SP-07 payload assemblies make movable shelter and Pin/Massline anchors. A third assembly marks the fixed return mooring. Each pocket releases two actual cargo-container payloads when there is pilot clearance. They charge only while physically inside their own moving pocket. The deeper pockets require active shepherding; the feature does not hold or teleport a body into place. A pod can be pulled, tethered, pinned, thrown, damaged, lost, or brought back by the existing powers and physics.

The mooring is the first admitted body, so a save taken during initial spawn publication already has a real receiver. Losing that exact receiver closes the expedition and preserves banked deliveries. The feature uses core's required `helpers.stageEntitySpawn` port: its callback-free commit records the body roster and sample custody before `entity:spawned` can run a synchronous save or New Game listener. Optional wrecks absent from a mid-admission save are never recreated on Continue.

A charged pod must be fully inside the 76 WU receiving circle, moving at no more than 12 WU/s relative to it, with the living pilot nearby and enough cargo capacity. The actual cargo owner transfers Phosphor Crystal; the actual economy owner grants the survey bonus. Six deliveries yield twelve units and 710 bonus credits in total. Each delivery is immediately banked. The player can leave after any delivery. A 90 second return window remains after the weather dissipates. The deadline is checked before handover, so arrival at or after expiry cannot settle.

## Ownership and force contract

`controller.js` and `forces.js` are simulation-only and import no Three.js. The force sampler composes the existing `normalizeField`, `sampleFieldAcceleration`, `couplingScale`, and `fieldFalloff` APIs. Moving-frame viscosity and a bounded inward well allow real debris to circulate instead of simply receiving a tangential kick. Smooth radial and angular masks provide the eye, front edges, and gaps. Heavy bodies shelter downstream; Pin's solver mass scale reduces acceleration without being compensated away.

The production runtime uses the real `queryPhysicalBodies` query, canonical `fieldBodyProfile`, and `deliverPhysicalImpulseDetailed(..., {continuous:true, dt, scaleEnvironment:false})`. The latter queues through `physicsAuthority`; GLASSWAKE never integrates a position, overwrites a velocity, cancels input, or applies damage. Player external-force protection still runs in the physical-effects owner. Existing tether and contact solvers remain authoritative.

Two zero-strength, zero-damping boundary descriptors are registered through the actual `fields.registerExternal` / `updateExternal` / `unregisterExternal` lifecycle. Their recipient lists are empty. They are runtime-only and excluded from fields' durable save and generic VFX, avoiding a duplicate force or misleading closed ring over the true gaps. The masked kernel result is submitted once per body and fixed tick.

Hard limits are local to this feature: 48 force recipients, at most 96 additional candidate checks after the existing host query, eight cover candidates, 17 expedition bodies, six sample receipts, 16 history entries, at most 0.1 s of force integration per update, 36 WU/s² sampler acceleration, 14,000 force, and 320 impulse per recipient/update. The pilot and finite owned roster receive admission priority in crowded sectors. Host spatial-query costs remain with the existing physical-query owner. Actual authority may further reduce the player impulse. The final presentation uses four pooled drawable objects and no particles, dynamic lights, or camera shake.

Sample custody is a bounded plain ledger. A live binding requires the numeric entity ID, the current occupant generation, and the exact expedition/sample tag. Missing bodies become lost; restore never respawns them. Cargo settlement reserves the source before synchronous `cargo:changed` listeners can reenter. A load or New Game during settlement cannot pay a replacement pilot. Deferred finish requests capture their originating run, so an outgoing settlement cannot close a newly restored expedition. An interrupted uncertain settlement fails closed instead of offering the same pod again.

Core normally recycles delivered pods' numeric IDs. New-generation pods remain distinct from historical receipts throughout binding, roster reconstruction, and cleanup. Expedition bodies belong only to this generation-aware roster; they are not inserted into the director's numeric-only `live.ids` / `live.roles`. The director owns the offer and outcome, while this runtime owns its physical lifetime through core. Resolving the encounter therefore cannot schedule unrelated recycled occupants for despawn.

## Public API

Import from `src/features/stormChase/index.js`:

```js
import {
  stormChase,
  createStormChaseRuntime,
  STORM_CHASE_ENCOUNTER_RUNTIME,
  readStormChaseView,
  createStormChasePresentation,
} from '../features/stormChase/index.js';
```

`stormChase` is the production registry system. `init(ctx)` takes the normal `{state,bus,helpers,registry}` context. `update(dt,state)` runs on the fixed table clock. Its methods include `serialize()`, `deserialize(raw)`, `snapshot()`, `restore(raw,{entityIdRemap})`, `readView()`, and `destroy()`.

For a focused host, `createStormChaseRuntime(ctx)` returns the same implementation, with `begin({patternId,live,director})`, `update(dt)`, `finish(reason)`, serialization/restore, `active`, and `view`. Missing required production owners reject admission. The direct entry is useful for local developer probes; the normal player entry is the authored encounter choice.

`STORM_CHASE_ENCOUNTER_RUNTIME` implements the existing `fire(d,live,state)`, `choose(d,live,state,choiceId)`, and `tick(d,live,state,now)` contract. It calls actual `d.say`, `d.offerChoices`, `d.abort`, and `d.resolve` methods. EncounterDirector's slow calendar tick controls offers and outcomes only. It must not be used to drive the storm's physical force.

EncounterDirector deliberately discards transient live dialog rows on Continue. The saved expedition runs independently of that row; new GLASSWAKE offers abort while it is active. If the old dialog no longer exists, completion uses the existing toast channel for its banked-sample result. It does not fabricate a director row or write director cooldown/receipt state. Codex may decide whether the integrated product needs an explicit post-Continue cooldown policy.

## Required shared hooks — Codex local only

### 1. Registry and fixed clock

In `src/core/registry.js`, import `stormChase` and add `['stormChase', stormChase]` beside the field/environmental machinery systems. Add the same import and factory-table entry in `src/runtime/nodeSystemFactoryTable.js`, keeping the browser and authoritative worker/Node route consistent.

In `src/runtime/authoritativeSystemManifest.js`:

- Add `stormChase` to `PRODUCTION_INIT_ORDER` after `fields`.
- Add it to `PRODUCTION_UPDATE_ORDER` after `fields` and before `physics`, alongside `gyreSnare`.
- Add it to **`TABLE_CLOCK_IDS`**. `NEAR_CLOCK_IDS` is the observer clock, and `CALENDAR_CLOCK_IDS` is too slow for forces.
- The existing default node-safe simulation capability is appropriate; no DOM or Three.js is imported by runtime initialization.

The owner factory is state-scoped, so separate test/game states do not share an expedition. Initialization does not begin a course or spawn a storm.

### 2. Authored encounter catalog

The supplied `8104-pro-five-stormChase.js` exports `encounterOrder`, `trigger`, `runtime`, and its `defineEncounter` default. Its filename is fixed by this commission. The existing `scripts/build-encounter-index.mjs` admits only lowercase names through `MODULE_RE`, so simply running the generator will silently exclude this module. In that script's `authoredFiles()` filter, make the narrow local admission change:

```js
.filter((entry) => entry.isFile() && (
  MODULE_RE.test(entry.name) || entry.name === '8104-pro-five-stormChase.js'
))
```

Then run `node scripts/build-encounter-index.mjs` and its `--check` mode. The generator owns `src/data/encounters/index.generated.js` and the actual self-registered runtime map. The exact-name exception preserves the existing validation of every other filename. Do not add a second script switch or direct bus command. This shared generator change and its generated output belong to Codex local integration; neither is included in the candidate.

The trigger is civilian/ambient, derelict-field proximity, gated to `sector_vesta_forge`. Runtime admission additionally checks the geographic approach, living flight pilot, supported Adventure mode, availability of cargo/economy/fields/lifetime owners, and clearance from the future rim. The existing encounter choice UI presents the three courses and decline.

### 3. Save envelope and actual actor remap

In `src/save/saveSystem.js`, add a `stormChase` data key to both serializer paths, in the same dependency order:

- `_saveCapturePlan()`: `['stormChase', () => this._callSerialize('stormChase')]` beside other physical expedition owners.
- `_serializeDataSteps()`: `data.stormChase = this._callSerialize('stormChase'); yield 'serialize:stormChase';`.
- In the restore sequence after `save:restoring` has begun, add `this._callDeserialize('stormChase', data.stormChase)` with the other feature slices. A missing key stages an empty expedition for old saves.

The runtime's `deserialize` stages the incoming ledger while the save owner is restoring. Its `save:loaded` listener consumes the staged envelope **after** persistent actors are respawned, using `state.sessionEntityIdRemap`, the existing `Map<string(savedId), liveId>` made by `_spawnPersistentEntities`. No generic save entity changes are needed: all 17 feature bodies already carry `flags.persistent`, and their `data.stormChase` tags serialize normally.

Occupant generations are intentionally non-enumerable and are fresh after Continue. Only the save owner's explicit remap, exact expedition/role/sample tags, and a live mapped body allow custody to bind to the new generation. Calling `restore(raw)` without an authoritative map retains strict generation checking. Reconstructed terminal samples are retired rather than revived. The test suite exercises the actual `_serializeEntities`, `_spawnPlayer`, and `_spawnPersistentEntities` methods, including a collision at a saved ID and a missing pod.

Local save schema/migration/index generation belongs to Codex and should follow `src/save/AGENTS.md`. The feature's own schema is additive version 1. Do not persist `stormChaseView` or private runtime/renderer objects.

### 4. Worker presentation mirror

The simulation publishes a bounded detached `state.stormChaseView`; `readStormChaseView(state)` reads the local runtime or this main-lane mirror. In `scripts/lib/simReadModel.mjs`, add `stormChaseView` to `DOMAIN_MIRROR_KEYS`. In both leaf metadata constructors, include `segs[0] === 'stormChaseView'` in the existing `ownerSnapshot` predicate beside `survivalDraftPublic` / `survivalResultsPublic`.

The published view is freshly constructed on a simulation change. The owner-snapshot rule makes its changed frame arrive with the accepted body reply instead of falling into the default 4 KiB / 60 tick cold tier. Do not relax or change cadence for other domains. `src/core/simLaneMain.js` already uses `DOMAIN_MIRROR_KEYS` to graft mirrored roots. No main-lane gameplay instance should be created merely to render the storm.

### 5. VFX owner and existing HUD

In `src/render/vfx.js`, import `createStormChasePresentation` and `readStormChaseView`. Lazily create one presentation beside `_initGyreSnare`, after the scene exists:

```js
this._stormChaseFx = createStormChasePresentation({
  THREE,
  scene: this._scene,
  toLocal: (x, z, out) => this._toLocalXZ(x, z, out),
});
```

Call `this._stormChaseFx.update(readStormChaseView(this.state), this.state.settings)` in the normal continuous VFX pass near `_updateGyreSnare(dt)`. Continue updating an existing adapter when the view becomes null or inactive so it clears stale geometry. Reuse the owner's `_combatBeamLocalizer` instead if appropriate; it has the same `(x,z,out)` contract. Global simulation coordinates are converted through that one bridge, respecting floating-origin shifts. In VFX teardown, call the existing `invokeVfxDisposer(this._stormChaseFx, 'GLASSWAKE')` helper and set `_stormChaseFx` to null beside `_gyreSnareFx`. Add `_stormChaseFx?.clear()` to the existing `_subscribe()` reset loop for `sector:exit`, `sector:enter`, `game:new`, `game:newGame`, `save:restoring`, and `save:loaded`.

The adapter receives `THREE` from the existing render owner; it never imports another Three.js build. Two ribbon meshes show the actual front band edges and gaps, and two pooled line batches carry current arrows, future traces, eye, pockets, cover wakes, pod charge, and the return mooring. Authored wreck/payload bodies remain with the existing body renderer. No placeholder squares or generated art are supplied.

The constructor optionally accepts `document` and `container` to mount its compact read-only HUD in the existing HUD host. Otherwise consume `presentation.cues.hud` through the local ORRERY presenter. The objective, next pocket, gap countdown, ready/banked counts, and return deadline should be visible in the accepted player route. This HUD has no new gameplay controls or key binding. Exact physical sample models are selected with `authoredPayloadAssetId: 'pod_cargo_container'`; cover and mooring use `'place_breakaway_sp07'`.

`settings.video.motionReduce` freezes ornament, and `settings.accessibility.flashReduce` lowers surface and line opacity. The existing `settings.video.flashReduce` alias is supported too. Neither setting removes a force boundary, forecast, directional arrow, or non-color distinction. Fronts have one versus two teeth; the fast hook stream has three chevrons; charged pods get a check mark; the mooring is a double octagon. The return phase removes the weather geometry while retaining physical pod and mooring cues. An inactive expedition clears immediately.

## Focused verification and limits

Run in the complete local checkout:

```sh
node --test --test-isolation=none --test-reporter=tap test/pro-five-stormChase.test.mjs
```

Use a supported Node version; this VM has Node v24.19.0. The VM's default isolated test runner reported a single file-level result, so explicit `--test-isolation=none` was used to enumerate and execute all subtests. The evidence file contains the final command and per-test results, not an inferred pass from import success.

The focused suite uses seeds 4242 and 137, all three patterns, and the actual core entity factory, field owner, physics command authority, cargo, economy, director, and save actor projection/rebuild. It covers safe moving eye, forecast replay, clear common gaps, boundary continuity, force budgets, body eligibility, mass/Pin/lee response, full physical pod charging and handover, full holds and unsafe speed, once-only settlement and reentrant listeners, missing/recycled bodies, return grace, pause/clock reversal, death/sector/New Game cleanup, and Continue identity remap. The six-delivery routes run the actual core lifetime sweep between pockets, exercising normal numeric ID reuse. Separate cases restore a later pod whose ID belonged to a delivered capsule, preserve foreign recycled bodies through director resolution, and start New Game during an interrupted restore. Steering in the charging fixture is controlled test input; it is not a claim of manual flight acceptance.

Because the upload omits large/generated/vendor files, the VM test host used a temporary module loader outside the repository to load **unchanged exact-base blobs** at their original module URLs:

| Omitted base dependency | Git blob SHA |
| --- | --- |
| `src/data/modelTruthCensus.generated.js` | `69a90c28e12a8259f7d57ce278934f637e4bd363` |
| `src/localization/catalogs/en-US.generated.js` | `0eda860fc650a58a961b7c451eac8074b84ef63d` |
| `vendor/fflate.module.js` | `06383895963036ad297dc51421e6b2d1910f5df7` |

The loader and dependencies are not part of the candidate. Their blob identities were verified with Git's `blob <length>\0<bytes>` SHA-1 calculation. In a full checkout the focused command needs no loader.

A separate VM check instantiated the presentation with upstream Three.js r184, matching the repository's pinned `three@0.184.0`. It inspected real Scene/BufferGeometry objects through every course on seeds 4242 and 9001, checked finite vertices and stable geometry/attribute/array identities, enforced at most four single-pass drawables, and asserted coordinate changes across a floating-origin shift. It also checked both accessibility flags and material opacity, paused-frame stability, return cues, clear, and exactly-once geometry/material disposal. It did not create a WebGL context, render a GPU frame, or qualify the optional DOM instrument in a browser.

### Local acceptance still required

After the above hooks, Codex should use the focused local route to accept the offer, read the opening, ride the moving eye with normal controls, physically shepherd a pod with Massline/Pin, hand it over below the speed limit, and choose whether to continue. Verify real authored model admission, camera-distance legibility, input/flight feel, opposing-current slingshots, heavy-cover wakes, reduced-motion/flash, and save/Continue while towing. Repeat the meaningful route on the contrasting seed. Browser/Electron and the authoritative worker must use the same integrated game route.

No GPU/player acceptance, performance budget on the complete game, Rapier flight-feel qualification, or integration with unpushed local work is claimed by this remote candidate. These are local closeout responsibilities under the commission, not hidden runtime placeholders.
