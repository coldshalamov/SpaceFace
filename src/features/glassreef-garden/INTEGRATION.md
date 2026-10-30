# Glassreef Garden candidate integration

Status: isolated creation candidate, not integrated or accepted. Base is exactly
`871c27854bb2acff09a80595844d9731d33b037a` (tree
`a3bb1bb7b8cccca0ab280f53bd6035f5f92124b4`). Execution model capability is unknown.
No local repository state or historical changes were used as inputs.

## Entry points and ownership

`createGlassreefGarden(ctx, {sectorId, x, z}, savedOrNull)` in `adapter.mjs` returns
one `glassreefGarden` instance for a GameState. Dispose before replacing it. The
factory uses the actual core `ctx.helpers.spawnEntity/removeEntity` methods and
`registry.get('actions').kernel.attachments`, falling back to combat's kernel.
There are no new global events or input listeners.

Root owns registration in the authoritative system manifest, placement, schema,
save/native reconstruction declarations, mission allowlists, visual admission and
ordinary player reachability. Do not merge the checkpoint alone; use the final
branch commit. No existing file is changed by this candidate.

1. Instantiate after core, actions/combat and economy are initialized. Keep the
   instance in the registry under `glassreefGarden`. Forward its `update()` once
   per fixed step **after native physics and attachment telemetry publication**.
   Do not run it in an additional timer. The argument `dt` is deliberately ignored;
   only `state.simTime` advances feature state, capped at 0.1 s per update.
2. Choose a legal Adventure sector and a clear 110-wu site footprint. Origin is a
   world XZ coordinate. No player-placement or route policy is embedded here.
   Call `enter()` after initial sector readiness; existing sector enter/exit bus
   subscriptions handle later visits. Root must place an ordinary discoverable
   POI and approach/prompt that opens the panel through the existing input owner.
3. `enter()` publishes at most ten bodies. It **does not** pretend native bodies
   already exist. The next post-physics `update()` prepares their nine joints.
   `read().ready` gates interaction. If the native owner is late, preparation
   reuses the same cohort, at most eight attempts, 0.25 sim seconds apart. After
   eight refusals it removes that cohort and retains an actionable `lastError`;
   `enter()` can explicitly retry once the owner is repaired/ready.
4. Use the existing owner-created `attachment_salvage_clamp`, not
   `tether_standard`: ordinary wrecks have tether sockets, not ship spool sockets.
   Every endpoint uses existing `combat_profile_tether_anchor` (four shared slots).
   Authored degree is at most three, reserving one slot for the player's Massline.
   Actual springs, momentum and contact response remain in SG-02/SG-03. Organic
   stress failure requests ordinary `attachments.cut(id, ownerId, reason)`.
5. Route selected-part buttons to `request(action, partId)`. Actions are `inspect`,
   `vent`, `brace`, `detach`, `rescue`, `clean`, `harvest`, `restore`, `emergency`,
   `settle`. These are method arguments, **not bus event names**. Vent targets the
   machine; brace targets the collar; choices/signing target the worker. Requests
   validate flight mode, living player, docking, target identity and proximity.
   Physical delivery happens only by slow, whole-body containment in the authored
   receiver circles, never by a UI completion button.

Example of root-owned wrapper glue (illustrative placement is intentionally absent):

```js
import { createGlassreefGarden } from './features/glassreef-garden/adapter.mjs';
// init(ctx), after all required owners:
this.site = createGlassreefGarden(ctx, approvedPlacement, loadedFeatureOrNull);
this.site.enter();
// post-physics fixed update:
this.site.update();
// save provider:
return this.site.serialize();
// teardown / before replacement on load or new game:
this.site.dispose();
```

## Real owner interfaces consumed at the pinned base

| Seam | Exact usage |
| --- | --- |
| coreSystem.js helpers | `spawnEntity(spec)` returns stamped numeric id/entity; `removeEntity(id,{immediate:true,reason})` retires through core |
| core entity identity | `entity.occupantGeneration`, plus exact live entity reference and private visit epoch |
| core physics receipt | `physics:impact` with `tick`, `aId/bId`, `aGeneration/bGeneration`, `impulse`; receipts lacking identity evidence are ignored |
| attachments owner | `create({defId,ownerId,targetId,sourceWorld,targetWorld})`, `get(id)`, `cut(id,ownerId,reason)`, `reel(id,delta,0)` on rest-length reconstruction |
| attachment observation | `state`, `lastTension`, `restLength`, endpoint ids and generations; no mutation of owner records |
| economy owner | `registry.get('economy').grantCredits(amount,reason)`; feature never writes credits or cargo |
| lifecycle bus | `sector:enter`, `sector:exit`, `save:restoring`, `game:newGame`, `entity:destroyed` (exact `payload.entity` reference) |
| presentation output | existing `comms:log` with `from`, `kind`, `text` |
| mining exclusion | existing `data.physicalCustodyOnly=true` prevents generic wreck draining; no fabricated commodity registry entries |

Pinned source checks: `src/core/coreSystem.js` core helper publication and destroyed
receipt; `src/core/physics.js` impact publisher; `src/core/sg02DynamicBodyOwner.js`
native createAttachment requires existing native records; `src/combat/attachments.js`
create/cut/reel/socket selection; `src/combat/runtime.js` explicit profile resolution;
`src/data/combatDefs.js` salvage clamp and tether anchor profile;
`src/systems/mining.js` `_drainWreck` custody exclusion;
`src/systems/economy.js` `grantCredits`.

## Save and lifecycle integration

Persist the **whole** `serialize()` envelope under root's declared feature save
key: version, placement, ten bounded poses (including hull), nine rest lengths,
and the versioned ecology/objective/receipt record. Restore with that envelope
and the identical placement; corrupt/unknown versions fail closed with TypeError.
Root must present a load incompatibility instead of replacing a rejected receipt
with a fresh unpaid garden. Absent feature state on a genuinely older save may
create the one new site; missing state on a current feature-aware save must not
silently mint another site.

The canonical combat/native save already knows about live joints. Root must
declare these feature bodies and their endpoint-owned joints as one reconstruction
cohort, **or exclude that cohort from generic native/combat snapshot restoration**
and rebuild it from this envelope after physics readiness. Do not restore native
copies and then create another nine joints. The current candidate uses the latter
reconstruction route: no native handles, world instances or old numeric entity ids
are persisted here. Joint warm-start/capture history is not preserved; rest lengths,
poses, velocities, yaw, angular velocity, hull, broken links, viability, maturity,
worker state, choices and receipts are. Exact native replay qualification belongs
to the controller; this is not an adoption implementation.

Dispose the outgoing instance before constructing the loaded/new-game instance.
`save:restoring` and `game:newGame` only shelve bodies; they do not replace the
feature record for root. Serialize at the normal quiescent owner boundary after
fixed updates, not halfway through physics/contact dispatch. Offsite simulation is
frozen; re-entry cannot replenish pods, heal hull, reset viability or pay again.

## Mission owner integration

`data.mjs` contains the authored `MISSION` and all stage text. Runtime already
enforces the inspect → unload/free rigger → isolate → choose → physically deliver
→ signed receipt journey. Root owns adding the compact mission to its ordinary
offer/journal path. Do not impersonate `ecology` or `mercyService` to bypass an
existing source allowlist. Add an explicit `glassreefGarden` source in the mission
owner's board/venue verification declarations if using those existing seams.

Read `missionEvidence()` for counts, choice, readiness, failure and paid completion.
`verifyMissionProof({missionId:'mission_glassreef_garden',siteId:'glassreef_garden',
receiptId:'glassreef_garden:settlement:v1'})` returns true only after the actual
economy-owned payment is observed. To use existing `mission:venueProof`, root must
extend its source allowlist and source-specific params check, and invoke this
verifier through the registry. This candidate does not emit a currently rejected
proof or mutate `state.missions`. Mission rewards must be zero: the site receipt
already settles all credits. Worker death supplies `failed:true`, not a forced win.

## Finite economy and recovery

Three unique seed pods, two unique waste canisters and one worker; no respawn or
harvest cycles. Harvest pays 180 cr per delivered viable pod plus 90 cr rescue,
maximum 630 cr. Restoration consumes at least two viable pods, pays 420+90=510 cr,
and does not sell the third pod. Every live viable pod must be delivered before a
commercial closeout. Waste must be caged or already destroyed; destroying it
bruises still-unreceived seed viability once per canister. Cleaning a separated
pod after rescue restores at most 0.15 viability once. Viability below 0.5 cannot
be sold/planted; force can damage it further through measured overload.

Drive loss releases its incident joints, leaves seed inventory intact, and permits
manual bracing/hand pollination. If a chosen restoration loses its second viable
seed, emergency closeout pays only 45+90=135 cr. If all seeds are lost, emergency
closeout is also available. Worker death is an honest terminal loss: no signature,
no feature payout. Abandonment shelves, never completes, the site.

Settlement is consumed before calling economy, defending duplicate/reentrant
requests and nested save callbacks. Exact observed credit delta marks it paid.
An owner exception or unexpected delta leaves a durable `consumed` receipt with
`complete:false`; automatic retry is forbidden because that could double-pay.
Root may implement explicit reconciliation against the economy ledger later.

## Presentation and acceptance limits

`createGardenPanel(document, host, adapter)` mounts in a root-owned prompt/screen;
dispose it on close. It installs no global keys. It has native focusable controls,
text warning/relief/classification/progress, and polite action feedback.
`gardenReadout(snapshot,partId)` can instead feed the existing prompt deck.

`createGardenView(THREE,scene,{authoredModels})` is a render-only optional view.
Templates keyed by `machine/growth/pod/waste/worker` are borrowed and never disposed.
Without templates, deliberate faceted turquoise ribs, pale green seed, amber waste
and a blue industrial drive give the site a coherent bounded prototype identity.
No authored assets or central material catalogs are replaced. Root must admit
this view instead of duplicate ordinary wreck meshes; qualify scale/collision,
lighting, camera readability and actual authored asset fit. Reduced motion defaults
on; essential information never depends on hue, animation or flashing.

Normal feature update visits ten nodes and eighteen graph edges (two fixed passes),
with thirty direct body lookup attempts and eighteen joint reads for a full intact
cohort. Receiver checks are capped at ten bodies × three zones. Preparation is
separately bounded at eight attempts × nine links. This excludes work performed
inside canonical owners; there is no FPS claim. No world/entity scan occurs in the
feature update. `read()` allocates a small snapshot for UI; root can call it at its
ordinary UI cadence, not repeatedly per mesh.

Focused command: `node --test test/pro-glassreef-garden.test.mjs`.
Tests use deterministic core data and a contract harness for owner calls, not
Rapier, WebGL or a live game. Native route, full save/native reconstruction,
ordinary POI/mission placement, real asset admission, performance/art qualification,
headed playtests and player-truth acceptance remain **unrun and controller-owned**.
