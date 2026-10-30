# Wayfarer House — candidate integration contract

Base: `871c27854bb2acff09a80595844d9731d33b037a` (tree
`a3bb1bb7b8cccca0ab280f53bd6035f5f92124b4`). Capability/model confirmation: **unknown**.
Disposition: source candidate, not registered, shipped, visually qualified or accepted.
No existing subsystem files or golden fixtures were changed. This is an independent relocation
episode, with no lease, charter, calendar or autonomous universe simulation.

## What to register

Create one `createWayfarerHouse` instance per GameState. Its `name` is `wayfarerHouse`.
It deliberately has no import-time side effects and does not register its own system/input/save hooks.
Root owns the lookup, clock and dependency declarations in the authoritative system manifest,
registry import, save/schema declaration, world-record admission and ordinary discovery.

```js
import { createWayfarerHouse } from '../features/wayfarer-house/adapter.mjs';
import { makeShipEntitySpec } from '../systems/ships.js';
import { removeCargo, sellableCargoQuantity } from '../systems/cargo.js';

const house = createWayfarerHouse({
  state: ctx.state, bus: ctx.bus, helpers: ctx.helpers, registry: ctx.registry,
  makeShipEntitySpec, removeCargo, sellableCargoQuantity,
  destinationAvailable, destinationStationId,
});
```

The two injected destination functions are **world-owner queries**, not feature event handlers:
`destinationStationId('commons'|'compact') -> canonical station content ID | null`;
`destinationAvailable(id, journey) -> boolean`. Check real berth destruction, admission, faction
denial and closure in that query. Only literal true admits a destination. Returning false for both
keeps the convoy at the fork with a visible withdrawal action; it never fabricates a third harbour.
The authored destination positions are origin + `(10000,950)` and `(10000,-950)`. Root should admit
these two harbour anchors there, or deliberately update feature-owned data and retest the route.
Do not silently bind either to a distant existing station with a different pose.

Call `activate({ id:'wayfarer_house_1', sectorId, origin:{x,z} })` from ordinary discovery once the
place and factory are admitted. `origin` is GLOBAL XZ, not sector-local. Keep the whole 10 km route
in one admitted gameplay region; this candidate does not cross gates. A repeat activation cannot
create a second house. Factory/admission failure leaves a visible `read().lastError` and returns
false. It does not declare partial creation successful or repeatedly mint replacements.

Register `update()` on the fixed-step simulation clock after NPC jobs have published their latest
pose/phase, but before aiPorts flushes the next accepted maneuver. Schedule it once per fixed tick,
including catch-up ticks; do not run it from a UI/render timer. `state.simTime` is the only clock.
It consumes at most 0.25 s between adjacent updates; an elapsed load/sector gap is a pause, not
offscreen travel. Near/table scheduling must retain this small convoy while the player participates.

## Actual consumed seams at the pinned tree

| Owner | Existing API / receipt | Candidate use |
|---|---|---|
| Core | `helpers.spawnEntity(spec)` | Four convoy entities, six physical carrier baffles, at most two raiders |
| Ships | `makeShipEntitySpec('ship_hawser'|'ship_wasp', options)` | Canonical hull/stats, no parallel damage/flight model |
| NPC navigation | `helpers.npcJobs.assign(entity, spec)` / `get(jobId)` / `release(jobId)` | Short `patrol` route at 18 wu/s; no cargo phase or invented movement event |
| NPC flight handoff | `claimControl(jobId,{claimId,holder})` / `releaseControl(jobId,claimId)` | Stops the job from writing flight during recovery/absence |
| AI maneuver | `claimActivity(entity,'wayfarer_house')`, `request({version:1,entityId,tick,kind:'hold',forceLocal,torqueYaw,boost,brake,targetHeading,horizonTicks,reason})`, `cancelActivity(lease)` | Canonical brake request while the job is leased; never writes pose, velocity or input |
| Combat attachments | `registry.get('combat').kernel.attachments.{get,create,cut,listForEntity}` | Three `attachment_twin_bridle` links, exact endpoint generations and actionInstanceId |
| Cargo | `sellableCargoQuantity(state,id)` then `removeCargo(state,id,quantity)` | Unreserved finite supplies only; exact debit receipt required |
| Economy | `registry.get('economy').grantCredits(amount,reason)` | Once-only escort cash; no direct money write |
| Factions | `registry.get('factions').applyRep(id,delta,reason)` | Once-only destination standing; no direct rep write |
| Navigation | `ui:setCourse {pos,label}` | Explicit `routeToHarbour(id)` action through existing world owner |
| Comms | `comms:popup {speaker,text,ttl}` | Short civilian responses, not mission completion |
| Dock/UI | `state.ui.docked` / `state.ui.dockedStationId` after canonical `dock:docked` commit | `dockedServiceProfile()` returns services only for the actual chosen harbour |

These signatures were read at the pinned ref, not inferred from the architecture event table.
In particular, attachment cut argument order is `(attachmentId, actorId, reason)`; the feature
does not emit `tether:broken` or counterfeit any other owner receipt. Each chain link has a different
owner, so the existing one-bridle-per-owner limit is respected. Payload sockets accept `tether`.
Live generation tokens are required; unstamped fixture bodies fail closed.

## State, save and restoration

The feature owns only its closed version-1 record. `serialize()` returns a detached bounded object:
journey, four body bindings, three link IDs, two raider bindings/retirement latches and six corridor bindings. It stores
no pose, hull, cargo, money, input object or live entity reference. Physical entities remain in the
canonical entity/save owner. Retained exact object references are transient casualty witnesses.
All cross-save rebinding must use the stable `data.wayfarerKey`, not just a numeric entity ID.

World-record admission must recognize `data.worldRecordId` values:
`wayfarer:<episodeId>:tug|hearth|clinic|garden|baffle_0..5`. Ordinary NPC jobs require a real
worldRecordId; root must admit/pin those canonical records with the existing world-record owner.
Setting a data stamp is not a substitute for admitting that record. The adapter supplies the
stamp inside its factory spec and does not write the world-record store itself.

Restore order:

1. Quiesce the old feature (`dispose()`), then restore canonical bodies/combat attachments/NPC jobs.
2. `house.deserialize(saved)`. This validates before replacing the active record and blocks ticks.
3. Resolve each surviving stable record through the world owner; `house.bind(role, entity)` for
   tug and surviving pods. Rebind the surviving defense ships with `bindRaider(index,entity)`.
   If a defense actor was canonically retired while absent, call
   `recordRaiderRetirement(index, id, occupantGeneration)` with that owner-verified receipt.
   Stale generations and duplicate receipts are refused; missing active raiders block finishRestore.
   Their stable keys are `<episodeId>:raider_0|raider_1`; their persistence belongs to core/combat.
   Do not call activate or spawn a replacement when an old occupant died.
4. Call `finishRestore()` after owner lifecycle reconciliation. Then resume fixed ticks.
   The next navigation update replaces only its own retained job, and attachment adoption checks
   the exact generations and actionInstanceId before use. `deserialize(null)` is the New Game reset.

If an entity was virtualized, rebind it by stable record before the player rejoins. A missing pod
pauses; it is not guessed dead. A known dead retained occupant becomes a loss even after its numeric
ID was recycled. A removed raider counts as owner retirement, never as a new defense spawn.
Thus root must finish rematerializing surviving raiders or deliver exact retirement receipts before
finishRestore can succeed; do not
present transient missing defense bodies as authoritative retirement. No universe-wide search is
performed by this feature; resolve its fixed keys from the canonical world-record index.

Cash and standing use independent once latches, set before synchronous owner callbacks. This lets a
save initiated from `credits:changed` retain pending standing without paying cash twice. The save
owner must capture registered owners in the same synchronous snapshot. A database-style transaction
spanning asynchronous partial saves is outside the pinned game's API and is not claimed here.

## Mission and service registration that root must finish

Use `missionProof(activeMissionId)` as a **read query**. The canonical mission owner must verify the
active mission's registered source/episode ID and then consume `complete` or `failed` itself.
It owns mission status, objective progress, mission rewards and any completion event. Avoid a
second mission cash/rep reward: the feature settles its escort cash and destination standing.

The pinned `missions.js` only accepts `mission:venueProof` from `mercyService` and `wreckCourt`.
It does **not** consume Wayfarer proofs. Root must explicitly add this source to its verifier or
add an equivalent owner-driven query path. This candidate deliberately does not emit an ignored
`mission:venueProof`, mutate active missions or force `_completeMission`.

The status panel can already use `objective()`/`readout()` without a mission row. For ordinary
arrival/service discovery, have the existing station/service owner consume `serviceProfile(id)`
or `dockedServiceProfile()` after validated docking. Keys are `refuge`, `triage`, `seed_exchange`.
Only surviving **supplied** pods with living named operators expose their service. Root owns the
actual service catalogue admission, pricing and any medical/cargo action; this query cannot mint
health or stock. `faction_free` gets the Common's consequence; `faction_scn` gets Concord's.
The other harbour receives neither. The resulting profile persists in the closed journey record.

No NPC docking protocol exists on the consumed seam. Convoy berthing is a real geometric mooring:
tug within 240 wu, surviving pods within 360 wu, all below 6 wu/s for 12 uninterrupted seconds.
This is separate from the player's canonical station docking. Do not emit player `dock:docked`
for the tug, add a fake station UI to the tug, or teleport pods into a dock slot.

## Player/presentation integration

Use `mountReadout(container, request => house.act(request))` inside the existing contact/station
panel and call its refresh with `house.read()` on that panel's existing cadence (4 Hz is sufficient).
Route input through the ordinary action/rebind owner; this module installs no global key listener.
All commands carry `revision`, reject duplicate/stale revisions and recheck proximity and availability.
Supply transfers require the player within 180 wu of the actual pod; all commands require rejoining
the house within 1600 wu in its admitted sector. Withdrawing is an explicit terminal choice.

The default tug remains the authored Hawser. `createPodSkin(THREE,role)` returns distinct deliberate
industrial candidate skins: twin living drums, asymmetric cross-marked clinic, open garden hoops.
Only the existing render owner attaches them to bodies, copies canonical transforms and disposes
them on retirement. Root owns final GLB/asset admission, proxy dimensions and performance qualification.
The two defense ships are ordinary team-1, nonlawful Quiet harassers. Existing hostility rules
protect team-2 civilians from unscripted first fire, so they pressure the player escort rather
than receiving a forged retaliation/predation flag. Pod risk comes from corridor contact, towing
and crossfire. If root wants deliberate civilian predation, admit a bounded encounter through the
canonical encounter owner; do not bypass engagement authority.

The six wreck bodies need admitted carrier-fragment skins; their collision poses are already real.
No added camera effect, shake, flashing, animation loop, reduced-motion exception or audio dependency.
Status and needs are text; announcements change only when objective text changes. Buttons preserve
focus and have explicit labels. Model silhouettes and readout remain separate from simulation.

## Focused checks and acceptance still required

Run `node --test test/pro-wayfarer-house.test.mjs`. Tests exercise the pure distance-following
episode plus actual adapter code with canonical-owner doubles. They do not claim Rapier or headed
player-route evidence. Root should verify ordinary discovery → supply → departure → defense →
separation → player Massline recovery → both destination variants → real docking/services, then
repeat with mid-recovery save/load, player sector exit, clinic death and a closed destination.

Qualification risks: towing stability and the 18 wu/s NPC governor under three pods; a held job's
kernel clock continuing while leased (adapter replaces the short job on each phase handoff);
post-arrival drift after navigation retirement; corridor clearance and camera/physics reach across
the 10 km route; rematerialization identity; real service admission; exact candidate skin scale.
The 10–15-minute target is demonstrated by a distance-following deterministic fixture, not a
promise about live combat duration. Do not land this candidate as accepted without those checks.
