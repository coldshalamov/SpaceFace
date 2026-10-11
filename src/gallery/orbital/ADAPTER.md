# Orbital Gallery — unapplied integration

The challenges already run on the authoritative runtime (`createAuthoritativeRuntime` via `bootRealPath`): Flight V3 writes thrust, Rapier (`rapier-dynamic`) solves contacts, the field system queues well/repulsor impulses, and Massline joints are `tether_standard` attachments. Nothing here is a second integrator. This file is the registration the shared checkout could not land.

Playable now, without that registration:

```js
import { openSession, PLAYABLE_SLICE } from './src/gallery/orbital/index.js';

const session = await openSession(PLAYABLE_SLICE[0]); // og-a1-straight-cue
session.control({ moveZ: 1 }); // same packet shape as src/systems/input.js
session.step(40);
session.control({ brake: true });
await session.play();
session.dispose();
```

`openSession` boots a fresh production runtime, spawns the Hitch (`ship_kestrel`), and steps at `SIM_DT` (1/60). Call `session.control(null)` to fall back to the authored tape. `resetSession(session)` disposes and rebuilds the same seed. Node proof:

```
node src/gallery/orbital/scripts/prove.mjs
node src/gallery/orbital/scripts/prove.mjs --id=og-a1-straight-cue --strategy=astern
node --test src/gallery/orbital/test/orbital-gallery.test.mjs
```

## Register the system (one id, one clock)

System object: `orbitalGallery` in `src/gallery/orbital/system.js` (`name: 'orbitalGallery'`). It must tick **before** `flightSlot`, `fields`, and `physics` so the input packet and motor impulses exist for this tick's solve.

1. `src/runtime/authoritativeSystemManifest.js`
   - `PRODUCTION_INIT_ORDER` (~line 32): insert `'orbitalGallery'` immediately before `'flightSlot'`.
   - `PRODUCTION_UPDATE_ORDER` (~line 89): same insertion, immediately before `'flightSlot'`.
   - `TABLE_CLOCK_IDS` (~line 342, next to `'actions'`): add `'orbitalGallery'`. It is a 60 Hz table system. Do not put it on the near or calendar clock. Unlisted capabilities already default to `{ nodeSafe: true, phase: 'sim' }`.
2. `src/core/registry.js` (~line 478, the `['fields', fields]` tuple): import `orbitalGallery` from `../gallery/orbital/system.js` and add `['orbitalGallery', orbitalGallery]`.
3. `src/runtime/nodeSystemFactoryTable.js` (~line 275): the same import and `['orbitalGallery', orbitalGallery]` tuple.

The manifest is the order both the browser registry and the Node production host materialize. Do not copy the system into a second worker list.

## Save and score

`state.orbitalGallery` is ephemeral session state (roles, tape, style chip). It is not an economy, cargo, reputation, or ship-stat write.

- Before any save snapshot, call `gallerySaveStrip(state)` from `src/gallery/orbital/session.js`. Do not add the key to the save schema.
- The arcade ledger from `createLedger()` / `recordScore()` lives on the caller, not on `state.player` or `state.economy`. Do not grant credits when a pocket is reached.

## Entering a challenge on the live route

Do not call `openSession` from the live frame: it constructs another runtime. On the already-running sim:

1. Set `state.mode = 'flight'` and keep the player on `ship_kestrel` (the Hitch). Do not swap hulls between challenges.
2. Spawn the scenario's `bodies` with the same specs `openSession` uses (`payload` ball + `physicsBody` for loose mass; heavy **dynamic** bumper/anchor because a static collider created after `prepareBackend` never receives a Rapier body).
3. Plant `scenario.fields` through `fields.plantField` (`emitter: false`, `tag: 'environmental'`).
4. After one step, create `scenario.lines` with `getCombatKernel(...).attachments.create`.
5. Assign `state.orbitalGallery` in the shape `openSession` writes (`phase: 'live'`, `roles`, `pockets`, `hazards`, `tape`, `limitTicks`). Draw one `state.rng()` sample into `styleChip` and do not draw again.
6. Leave flight input alone when `liveInput` is set; the system copies it into `state.input` each tick.

Presentation, not a new renderer: each body carries `data.galleryAsset` (`GALLERY_ASSETS` in `assets.js`) pointing at existing release GLBs and their published LODs. Draw those meshes. Field volumes are the `fields:deployed` records the field system already emits. No camera-facing cards. Layouts were checked against `glassHalfExtents(144, 50, aspect, 60)` for 16:9 and 4:3, and the focus body against 9:16, so the shipping chase camera can see the mechanism without a zoom change and without off-screen scenery.

## Challenge index

Six families, four each. The fourth of each family is `synthesis: true`. Twelve scenarios carry two tapes; their win signatures (pocket, approach side, cut, boost, contacted roles) differ.

| id | family | strategies |
|---|---|---|
| og-a1-straight-cue | momentum | astern, offset |
| og-a2-object-ball | momentum | through, high |
| og-a3-gate-cue | momentum | slip |
| og-a4-three-ball | momentum | chain |
| og-b1-orbit-strike | sling | plus-z, minus-z |
| og-b2-apex-cut | sling | release |
| og-b3-tow-post | sling | high, low |
| og-b4-swing-and-strike | sling | arc |
| og-c1-two-ball | chain | chain, direct |
| og-c2-timed-crosser | chain | early, late |
| og-c3-pin | chain | knock |
| og-c4-crosser-chain | chain | time |
| og-d1-intercept | cargo | early, late |
| og-d2-gap | cargo | wait, around |
| og-d3-lane-change | cargo | nudge |
| og-d4-bank-the-lane | cargo | bank |
| og-e1-into-the-well | field | straight, high |
| og-e2-repulsor-berm | field | through, high |
| og-e3-heavy-shrugs | field | around |
| og-e4-well-cue | field | feed |
| og-f1-beat-the-drift | rescue | high, low |
| og-f2-tow-clear | rescue | tow |
| og-f3-either-pod | rescue | near, far |
| og-f4-drift-well-line | rescue | tow |
