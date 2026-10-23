# Exact-base integration contract

Base: `34310c836bf80216b869331c54b777c231a637ee`.
Candidate branch: `codex/pro-experiences-salvageTender-20261023`.

All candidate writes stay in `src/features/salvageTender/**`,
`src/data/encounters/8203-pro-salvage-tender.js`, and
`test/pro-experiences-salvageTender.test.mjs`. The snippets below are the deliberately
uncommitted shared seams for the collecting integrator. This is a set of executable
production owners/adapters; shared imports activate them. The branch alone does not
register a feature into the unmodified master manifest.

## 1. Register the two systems

In both `src/core/registry.js` and `src/runtime/nodeSystemFactoryTable.js`, import:

```js
import { salvageTender } from '../features/salvageTender/runtime.js';
import { salvageTenderPrompt } from '../features/salvageTender/prompts.js';
```

Add these entries to the respective lookup maps, beside `towlineTable`:

```js
['salvageTender', salvageTender],
['salvageTenderPrompt', salvageTenderPrompt],
```

In `src/runtime/authoritativeSystemManifest.js`:

| Manifest list | Required insertion |
| --- | --- |
| `PRODUCTION_INIT_ORDER` | `salvageTender`, then `salvageTenderPrompt`, beside the existing `towlineTable` pair. This is after combat, cargo, economy and stationServices initialization. All system objects, including save, are already registered before init. |
| `PRODUCTION_UPDATE_ORDER` | `salvageTender` **immediately before `physics`**, after the flight/control owners. It publishes this tick's bounded berth force. |
| `TABLE_CLOCK_IDS` | `salvageTender`. It needs every physical fixed step. Do not put it on NEAR/CALENDAR. |
| `SYSTEM_CAPABILITIES` | `salvageTenderPrompt: Object.freeze({ nodeSafe: true, phase: 'platform', capability: 'hud' })`. It is event-only and has no update entry. |

In `src/core/runReset.js`, add the same two names to `FRESH_RUN_SYSTEMS` beside the
Towline pair. This explicit whitelist, not generic registry iteration, drives New
Game. Both owners implement reset and destruction.

In the browser registry's `TEARDOWN_DEPENDENCIES`, add:

```js
Object.freeze(['salvageTender', 'render']),
```

The runtime's destroy hook synchronously emits `salvageTender:reset` before removing
its bodies. The presentation adapter releases its resources on that event. This
dependency makes release-before-renderer-destroy explicit, independent of future
manifest reordering. The main simulation owner stays DOM/renderer independent.

## 2. Save and Continue: the adapter already installs itself

`salvageTender.init(ctx)` calls `installSalvageTenderSaveAdapter` on the registered
save instance. **No shared saveSystem edit is required for this candidate.** It wraps
the exact base's `_saveCapturePlan`, `_serializeDataSteps` and `_restoreChunks` on
that instance only. Both capture lanes append the same `salvageTender` key in the
same order before the existing envelope/checksum encoder. Existing validation,
rollback, persistent body serialization, native snapshot and attachment remapping
remain authoritative.

The detached sidecar is adopted before the original restore generator runs. The
original `save:loaded` receipt then calls `afterContinue()`, which reconnects the
actual remapped bodies and the partially paid service's exact player hull. A native
rack constraint may still be pending after that receipt; the adapter waits for the
combat owner instead of manufacturing a joint or declaring the saved line broken.

An older save with no sidecar normalizes to undiscovered. A malformed sidecar never
creates an owned home. Missing original-body records stay missing. The adapter's
disposer restores only the methods it still owns.

If the integrating project prefers inline shared save hooks, remove the installer
call and use these exported functions in the corresponding existing Towline slots:

```js
captureSalvageTenderSave(registry);          // both capture lanes
restoreSalvageTenderSave(registry, raw);     // before persistent reconstruction
finishSalvageTenderRestore(registry);       // after the original load/remap
```

Use either the installed adapter or inline hooks, never both. The focused tests use
the installed adapter and the actual canonical sync and asynchronous load routes.

## 3. Ordinary encounter index

The new encounter module exports its ordinary `trigger`, `runtime` and default
catalog definition, order `8203`, ID `pro_salvage_tender`. After collection, regenerate
the existing index with:

```sh
node scripts/build-encounter-index.mjs
```

The resulting shared generated file belongs to integration, not this candidate.
The encounter owns only the introduction. Resolving, declining, timing out or leaving
does not delete the persistent tender or its crates. Its zone-center anchor passes
a deterministic collision-clear corridor search before spawning the original.
The ordinary station fallback shares the same one-per-run owner.

## 4. Select the authored hull before generic whole-ship selection

In `src/render/partsLibrary.js`, import:

```js
import {
  salvageTenderWholeShipVisual,
  salvageTenderRequiresAuthoredHull,
} from '../features/salvageTender/readModel.js';
```

At the start of `requiresProductionWholeShipForEntity(entity)`:

```js
if (salvageTenderRequiresAuthoredHull(entity)) return true;
```

At the start of `wholeShipVisualForEntity(entity, options = {})`:

```js
const tender = salvageTenderWholeShipVisual(entity);
if (tender) return tender;
```

The returned selector is `{ file: 'wholeships/repair_tender.glb',
assetId: 'SF_WHOLESHIP_REPAIR_TENDER', roleId: 'personal_salvage_tender', required: true }`.
Do not substitute a generic drifter visual or set a traffic role. The drifter entity
factory supplies ordinary entity fields; this hook selects the authored barge.

## 5. Draw the physical deck after the presented hull transform

In `src/core/renderUpdatePhase.js`, import:

```js
import {
  updateSalvageTenderPresentation,
  releaseSalvageTenderPresentation,
} from '../features/salvageTender/presentation.js';
```

Add `bus` to the `runRenderUpdatePhase` arguments. At its call in
`src/core/registry.js`, pass `bus: ctx.bus`.

Beside the early nonflight bomb cleanup:

```js
if (state?.mode !== 'flight') releaseSalvageTenderPresentation(state);
```

After `render.prepareFrame(...)` and before `drawPreparedFrame()`, beside the existing
`updateBombPresentation` lane:

```js
try { updateSalvageTenderPresentation(state, bus); }
catch (err) { vfxError ||= err; }
```

This ordering is required: the deck copies the hull's interpolated/presented world
matrix, including any render-space rebase. It is a separate scene root, so hull-root
replacement cannot dispose its leases. The wrapper manages the renderer/scene lifetime.
`save:restoring`, `sector:exit` and `salvageTender:reset` synchronously dispose both
direct and registry-owned presenters. Late loads cannot reattach after disposal.

The authored equipment is already catalogued in the base render manifest:

| Machine | Damaged | Installed |
| --- | --- | --- |
| Power | `places/place_power_skid.glb` | `places/place_power_skid_patched.glb` |
| Bench | `places/place_repair_scaffold_bent.glb` | `places/place_repair_scaffold.glb` |
| Rack | `places/place_container_rack_abandoned.glb` | `places/place_container_rack.glb` |

Paths are relative to `assets/ships/release/parts/`. The physical supply pod remains
its own existing payload render. No extra hull or decorative duplicate cargo is
created. `salvageTenderPresentationDiagnostics(state)` exposes mounted, pending and
failed authored loads for acceptance.

## 6. Read models and return navigation

`getSalvageTenderReadModel(state)` is a detached read surface for contextual HUD or
inspection consumers. It includes stage/capabilities, exact live numeric entity ID,
durable body identity, hull/condition, unsealed and sealed hold quantities, actual
rack manifest, next-stage costs/available supply, paused service and recent history.

`getSalvageTenderHomeMarker(state)` supplies the owned home's current/saved global
position and sector. It remains available while the player is away. The local-map
adapter uses the existing ownership-marker model for both SYSTEM and LOCAL charts.
In `src/ui/galaxyMap.js`, import:

```js
import {
  getSalvageTenderMapMarkers,
  filterSalvageTenderMapContacts,
} from '../features/salvageTender/readModel.js';
```

Immediately before the final return in `buildClaimOwnershipMarkers`, append:

```js
markers.push(...getSalvageTenderMapMarkers(state, sid));
```

In the final object returned by `buildLocalModel`, replace its `contacts` field with:

```js
contacts: filterSalvageTenderMapContacts(state, contacts),
```

Apply the filter after both live and remembered contacts have been collected. It
removes only the owned original tender's duplicate contact; the home marker supplies
its one persistent glyph. Unclaimed tenders and every other contact remain ordinary
contacts. There is no claim-system write or new map screen.

The marker uses sector-local `drawPos` for the chart and global `x/z` for a local
course. It stamps the actual body through the existing stable-selection helper and
uses a 70 m stand-off. When viewing the home sector from elsewhere, it retains its
chart position but deliberately omits local course coordinates and transient entity
binding. The exact existing map course resolver therefore plots the sector route.
This works even though the ownership canvas tags the selected marker as `claim`.
No shared course-resolver edit is needed.

Runtime navigation already emits the existing `ui:setCourse` contract. Local marks
use `autopilot:false` and bind an available live entity through the world owner's
stable selection logic. Remote home navigation uses `{ sectorId }` without local
coordinates, allowing world to plot the ordinary discovered route. Claiming or
securing refreshes the home mark. No nav state is directly mutated.

## 7. Integration acceptance

Run the focused suite against the full exact-base repository and its locked
dependencies:

```sh
node --test test/pro-experiences-salvageTender.test.mjs
```

Then run a normal Adventure New Game and the repository's player-truth Adventure
route at the coherent integrated boundary. Visually inspect the authored hull,
three machinery transitions, readable costs, modest lamps, reduced-motion/flash
settings, map return action and promptDeck gamepad/keyboard/touch behavior. Test
ordinary scan completion, refuse/return, cancelling a rescue, zero-credit recovery,
part-filled hold, damage/patch, depart/return, and cold Continue while towing and
while service is partly delivered.

The candidate's focused suite does not claim those rendered public-route judgments.
Do not label a missing-asset or unregistered build playable acceptance. Experimental
worker presentation mirrors/events are outside this candidate; the exact base's
normal main simulation lane is the integration target.
