# Nacre Sluice candidate — integration contract

Status: source candidate, NOT registered, shipped, playtested or accepted. Base inspected remotely:
`871c27854bb2acff09a80595844d9731d33b037a`, tree
`a3bb1bb7b8cccca0ab280f53bd6035f5f92124b4`. Model capability: unknown; this surface
cannot independently verify the requested ChatGPT Pro identity. No local repository state was input.

## Entry and registration

Import `createNacreSluice` from `src/features/nacre-sluice/runtime.js` in the existing authoritative
factory assembly. Construct ONCE for each authoritative `GameState`, passing its ordinary
`{state,bus,helpers,registry}`. Register a controller wrapper named `nacreSluice`, update before
`physics`, after time and player input have been sampled. Its `update()` calls `instance.step()`.
Do not run a duplicate browser instance when the worker owns the simulation. There is deliberately
no autonomous proximity scan or private event bus. The controller owns ordinary Adventure placement.

At the chosen site's arrival call `enter({origin,sectorId})`, where origin is a FINITE global XZ
position derived through `sectorLocalToGlobalForSector`, stable for this authored site across saves.
Choose a cleared 440-by-420-wu neighbourhood; this candidate does not clear existing scenery.
Respect refused entry; a duplicate original is an error, not permission to mint another core.
The root owns adding catalog/encounter entries and existing-file glue. Do not register in Swarm,
Fortify, Gauntlet, racing or Hero routes. Only `mode==='flight'`, Adventure, undocked, unpaused runs.

The feature manifest is `manifest.json`; register factory paths in both browser and node tables,
add the system to the authoritative init/update/clock membership and save declaration through their
existing owners. No lists/manifests outside this feature have been changed by this candidate.

## Actual owner interfaces consumed

- `ctx.helpers.spawnEntity(spec)` and `removeEntity(id,{immediate:true,reason})`: core lifetime.
- `ctx.helpers.queryRadius(pos,radius)` returns entities: canonical spatial query, twice only during
  an active pressure discharge. Per-volume candidate cap 64; overflow suppresses that volume for
  that tick, rather than selecting an order-dependent first subset. No whole-sector per-tick scan.
- `queuePhysicsImpulse(entity,impulse,evidence)` from `core/physicsAuthority.js`: ALL machinery and
  jet motion. Source `nacreSluice`, explicit reason, tick, dt and external player protection.
- `physicsBodyNativeReady(entity)` plus the existing yard adapter's Rapier record admission check
  (`registry.get('physics')._sg02.records`, exact entity, body, no pending restore). This deliberately
  fails closed on unsupported physics backends. The native record query is an existing seam but
  private-shaped; controller must recheck it if the physics owner changes that interface.
- `refreshEntityPhysicsIndex`, `refreshPhysicsPartition`, `requestActivityReclassify`: collision
  admission only, identical owner pattern to the existing industrial-disaster adapter.
- `getCombatKernel(ctx).attachments.listForEntity/cut`: preserve active player lines during ordinary
  retirement; forced sector teardown/dispose cuts bound endpoints through the canonical service.
  Existing player flight, Massline creation/reeling/release and combat damage remain untouched.
- `state.entities`, `playerId`, `occupantGeneration`, `simTime`, `tick`, `state.rng`: authoritative
  observations. No position, velocity, hull, cargo, money, input or mission-owner writes.

No new event names are assumed or emitted. Root translates its existing UI/mission commands to the
methods below. Existing sector/save lifecycle events can invoke these methods through root glue;
this feature does not register speculative subscriptions or modify shared routing.

## Presentation and input

`view()` is a detached bounded read model. It includes authored asset IDs, exact original body IDs,
occupant generations, epoch, world poses, physical radii, layout/signs, pressure and instruction text.
Mount the same authored places the industrial-disaster adapter already reuses (see layout ASSETS).
After the actual original's view has loaded and is visible, call:
`admit({role,id,generation,epoch})`. A stale callback is a no-op. Bodies start noncolliding and
untargetable; admission refreshes that same identity's native collider. The job clock waits until
all surviving originals are admitted to the native owner. `enter` does not admit invisible walls.
Root owns final silhouette/collider admission and loading UX. Do not automatically admit marker
geometry as a substitute for the authored body. No new asset dependencies or art claims.

`presentationData(view,{reducedMotion})` supplies signs, volume markers and steady lamp source data.
`createNacreMarkers(THREE,scene)` builds optional volume overlays, with explicit resource disposal.
It uses the already loaded Three instance; no simulation module imports Three. `createNacreReadout`
provides safe DOM text, no innerHTML, keyboard handlers, autoplay, flashing or live-region countdown.
Root's existing prompt deck must expose two actions with rebound input hints:

1. At the west entry sign: `command({action:'accept',sequence,epoch,actorId,actorGeneration})`.
2. Within 35 wu of the live west control tower: same request with `action:'purge'`.

Use an increasing safe integer sequence (greater than saved `lastCommand`); refresh `epoch` from the
current view. Repeated accept/purge callbacks cannot restart a timer. Reject reasons are suitable
for the existing receipt surface. Do not create a new global key binding. The manual relief and
core are manipulated with ordinary Massline/flight controls, not a special mission button.

## Mission, two approaches and aftermath

Title: **A Pearl in the Teeth**. The catalyst core is valuable because the refining line needs it,
not because it glows. West-entry briefing: recover the original stranded core into the east cradle.
The cradle checks FULL radius clearance and measured speed <=4 wu/s for a continuous 2 sim seconds.
Leaving the cradle or overspeed resets dwell; neither mistake fails the job. Physical delivery
retires the exact original only AFTER the persisted delivery flag is reserved. A pushed, slung,
rammed or pressure-assisted original qualifies. No route flag, tow flag, kill quota or teleport.

**Approach A — operate the line.** Purge at the west tower; pressure decays in at most 2.23 seconds
from full. The heavy cargo gate servos north once pressure <25%, leaving about nine quiet seconds
for a committed central tow. Baffles continue their anti-phase sweep: watch the opening and use the
three marked safe pockets to reset a poor line. Their finite motor acceleration can be opposed by
real towing force. Normal cycle: quiet 8 s, buildup 4 s, discharge 6 s; jets are directional and
geometrically bounded, with <=10 wu/s² raw acceleration before canonical player protection.

**Approach B — service the basin from outside.** Take the longer northern bypass, using the two tank
anchors to turn the tow through sheltered space. Optional first action: tow the red relief plug
24 wu from its seat, or destroy it, to vent permanently; this also lifts the cargo gate and makes
central recovery easier. Destroyed controls do not prevent this solution. The geometric bypass
exists even with both controls and relief inaccessible. A radius-nine core has a verified continuous
clear polyline (-112,0)->(-172,0)->(-172,165)->(172,165)->(172,0), with coordinates site-local.
This is clearance evidence, not proof of a player-controlled native tow at the final asset scale.

The southern catalyst pallet is optional temptation beside a pressure lane. Deliver it to the same
cradle for a separate salvage flag. Damage/loss remains a tombstone; no replacement core or arbitrary
mission reset is minted. Destroying the core loses the main contract honestly, while pallet recovery
remains playable. No new enemies are spawned: host Adventure combat can enter this same physical
space; its ships/wrecks feel the same bounded jets. The site is a puzzle/combat environment, not a
parallel enemy or projectile system.

`settlement()` returns a stable mission receipt key only after measured delivery. Root's canonical
mission objective owner must query this, book its OWN idempotent objective/reward receipt, and then
call `acknowledge(key)`. `acknowledged` persists; querying does not itself grant anything. Do not
translate it into an unconditional mission-complete event or direct credits write. Main and optional
salvage rewards must have distinct canonical receipt keys; `salvageDelivered` can become true after
main acknowledgement, so continue observing it. Suggested authored rewards: 1200 cr main, 350 cr
pallet, subject to economy owner tuning. This candidate does not create those rewards.

## Save, re-entry, retirement

Save key `nacreSluice`, version 1. `serialize()` captures measured local poses, velocity, spin, hull,
loss tombstones, elapsed cycle, purge, pressure, relief, objective dwell, terminal flags and receipt.
`deserialize(raw)` validates the entire known-role pose set BEFORE destructive cleanup; unsupported
versions and nonfinite/out-of-bounds poses throw. Unknown fields/roles are discarded; no runtime IDs,
renderer objects, arrays of histories or wall-clock values are saved. Save adapter calls these
methods synchronously at the authoritative save boundary. Generic entity persistence must exclude
`data.persistenceOwner==='nacreSluice'`, as for other feature-owned physical sites: feature restoration
is their single creator. Do not serialize a second copy of these originals in the generic world.

After load, call `enter` with the same site address, then repeat visual/native admission. Initial
creation passes saved poses/motion into the canonical entity factory, never writes live poses.
Away time and asset-loading time do not consume cycles. Ordinary leaving calls `leave()`: player
lines refuse automatic unload. Explicit sector/run teardown calls `leave({force:true})`. `dispose`
is idempotent. The root's canonical attachment save owner must rebind any saved player Massline
using durable `worldRecordId` after feature originals exist; this candidate does NOT create a second
attachment persistence owner. Admission may wait while that existing owner restores its line.
Destroyed or reused pooled handles cannot become another role or resurrect a lost body.

## Focused evidence and remaining acceptance

Run `node --test test/pro-nacre-sluice.test.mjs`. Tests use the SAME portable adapter with instrumented
canonical ports, measured body fixtures and deterministic sim-time steps. They verify deterministic
layout, continuous bypass clearance, pressure telegraph, relief displacement, geometric speed/dwell,
mid-cycle save continuation, destroyed control recovery, force attribution and bounds, duplicate
callbacks, pooled-ID defense, lifecycle retirement, separate optional salvage and terminal receipts,
invalid restore safety, pause/absence and reduced-motion text semantics.

No native Rapier flight/tow/playthrough, renderer asset load, actual collision silhouette, performance
measurement or reward/mission integration was executed in this remote candidate workspace. Root must
exercise both routes from ordinary Adventure, full-pressure mistake/recovery, control/plug destruction,
mid-tow save/load including canonical attachment restoration, optional pallet after main settlement,
re-entry and final mission receipt through its owners. Performance/body and authored-art admission,
headed playtest and route acceptance remain root-owned. Do not infer them from these focused tests.

Bounded costs: 20 authored bodies maximum (14 fixed banks/anchors/control),
3 active servo motors, 2 jet queries with 64-candidate refusal cap each, no feature projectiles,
no effect pool or particle emitters, 6 marker meshes, 12 decorative lamp records, 5 signs. No deps.
