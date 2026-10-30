# Iona Vey candidate integration

Base: `871c27854bb2acff09a80595844d9731d33b037a` (verified via GitHub Git commit API).
Model capability: unknown. This is an unregistered source candidate, not accepted gameplay.

## Register and persist

Import `createIonaVeyRivalSystem` from `src/features/iona-vey-rival/index.js` and register one
instance named `ionaVeyRival`. Initialize after `npcJobsRuntime` has published `helpers.npcJobs`;
update before `npcJobsRuntime` so its existing movement writer consumes the current target/lease.
Keep the same instance through the run. Add its serialize/deserialize slice to the canonical save
envelope under `ionaVeyRival`, declare schema `spaceface.ionaVey.v1`, and add the plain read
projection to the worker mirror. This feature keeps state in its registered instance, not a second
entity store. World/near entity admission, body solving, input and saves retain their owners.

Generic world persistence MUST exclude entities whose `data.persistenceOwner === 'ionaVeyRival'`
from generic capture/replay. This adapter captures and shelves its own at hard sector exit, restores
finite source remainders, and uses the ordinary `helpers.spawnEntity` / `removeEntity` APIs. Double
persistence would create ambiguous stable identities; the adapter deliberately refuses to pick one.
`save:restoring` must precede owner deserialization; `save:loaded` follows sector reconstruction.
The root's save load sequence must not update this feature between those boundaries.
Always call deserialize, including a null/missing slice: an older save resets the character to
fresh instead of inheriting a newer run's history. Deserialization outside save:restoring refuses.
On a malformed or future slice,
propagate the validation failure; do not catch it and start a fresh source.

## Ordinary route and authored placement (controller owns this)

After world/native readiness, call `helpers.ionaVeyRival.begin({index, sectorId, anchor:{x,z},
receiver:{x,z}})` with indices **0, 1, 2**, in order. These are explicit owner calls, not invented
event names. Pick a safe real recovery apron and a clear approach, 260–2000 wu from source to
receiver, without interfering with an existing mission berth. Keep all three appearances in the
same sector, spaced along one ordinary salvage route. A later index refuses until the previous
physical recovery is closed. Repeated admission of the same index is idempotent. Space their route
triggers; do not run all three at once. No sector-entry lottery and no new tug per appearance.
Cross-sector migration is intentionally refused: use the world's existing travel owner before
extending this candidate to another sector, rather than teleporting Fair Measure.

The ship is the existing `ship_hawser`, `faction_free`, with no new faction or hull geometry.
Ship admission uses the canonical spawn budget. At most one tug and five finite wreck bodies
exist across the whole arc. Hull damage and source depletion persist. The first frame is a disputed
stake, the second appearance has two independent real loads, and the third repeats the two-load
test before settling earned alliance or lawful rivalry. Iona never initiates compulsory combat.

Only the marked frame is legally staked (`data.salvorClaimedBy = 'iona_vey_tug'`). The claim ring is
a readable work boundary, not an exclusion zone that criminalizes flight through it. Unmarked
electronics are open salvage. First cooperation releases the claim and lets the player perform
the actual tow. Later cooperation means Iona tows her frame and the player tows the open rack.
Leave ropes connected inside the receiver at ≤8 wu/s for two near-sector seconds. At least half
the authored hull must remain. There is no elapsed-away arrival, cutscene move, magic pickup,
or job-clock completion credit. Partial touch then rival delivery does not count as player work.
If the player strips cargo before staging it, it is real salvage but fails the joint lift.
Damaged cargo that cannot qualify can still be stripped through ordinary mining to close its
recovery as recovered rather than staged. No timeout destroys a player's unhandled load.

Staged bodies retain their finite cargo and can still be worked. Iona's stake remains on her
frame; an open/joint load remains collectible normally. Cargo extraction and buyer proceeds go
through existing mining/cargo/economy owners. The feature makes **no economic transfers** and
issues no bespoke reward, so there is no second wallet, minted cargo, or replayable reward receipt.
After two actual joint recoveries, accepting the final joint lift releases Iona's exclusive stake
on the existing final frame: she supplies tug time and both final loads become joint salvage.
This is the alliance's physical dividend, using existing finite units rather than another spawn.
An alliance is character memory, not an unbacked faction-reputation payment. Later theft of a
staged staked frame revokes alliance. A dead tug retires the character permanently.

## Consumed owner interfaces (inspected at the pinned base)

* `helpers.npcJobs.assign(entity,{kind:'salvor',sectorId,speed,workS,loadS,unloadS,payload,route})`,
  `get('job:'+worldRecordId)`, `release`, `claimControl`, `releaseControl`, `interrupt`.
  `npcJobsRuntime` consumes the salvor job's explicit target (`data.towTargetId`) and the frame's
  `salvorClaimedBy`. It owns the occupational tractor and travel intents. The salvor route is
  `[receiver, source]`; its actual return leg tows the frame. This deliberately avoids a hauler:
  haulers require a freight manifest and their LOAD can consume unrelated miner handoff lots.
  Iona does not carry a phantom manifest. A completed clock without physical arrival never grants
  success. Grace lasts 30 observed seconds; choices do not reset it. Standby uses a long-work
  `tender` job with `claimControl` and one braking intent under that granted external-control
  lease. The adapter does not steer. Damage releases its own standby lease, then calls the owner's
  `interrupt(jobId,{entityId})`; a live flee phase takes precedence over re-parking or towing.
* `makeShipEntitySpec` from `systems/ships.js`; core spawn/remove helpers; spawn budget
  `request(1,key)`, `bindEntity(id,key)`, `release(key)`.
* Existing combat kernel `attachments.listForEntity`, `attachmentBindsOccupant`, native physics
  readiness and `helpers.combatPhysics.getAttachmentTelemetry` for generation-bound live ropes.
* Existing `salvage:claimJumped` payload `{wreckId,claimantId,offenderId,visits,t}`. The live source's
  protest stamps and a real pool decrease must match before recording theft. Mining already reports
  theft to `lawSecurity.reportIncident`; this feature observes the result, never reports twice.
* Existing `salvage:completed`, `combat:damage` (`targetId,attackerId,applied`),
  `entity:spawned`, `entity:killed`, `entity:destroyed`, `sector:exit`,
  `save:restoring`, `save:loaded`. Queued destruction may arrive after core removes the map entry;
  it requires the retained object and generation, and never mutates a replacement occupant.
  Scalar damage callbacks additionally require an observed protection decrease.
* `comms:log` for concise factual lines. No alternate radio catalog or new bus protocol.
* `bindMission(missionId)` optionally associates an **already-active** `tow_recovery` mission
  only if its canonical `targetEntityIds` includes an actual current Iona body. It does not create,
  complete, rewrite, or pay missions. The mission owner observes the physical tow in its normal
  update. If adding a board route centrally, use that owner's ordinary offer/accept path and
  target binding; do not send `mission:completed` from this feature. Missions are optional here.
* Faction projection reads `state.factions.faction_free.rep`; no separate faction state or rep
  changes. Existing law/NPC owners retain faction consequences for attack and theft.

## Presentation and input

`helpers.ionaVeyRival.read()` returns detached bounded status/claim data. Mount
`mountIonaStatus({root,read,act})` from `presentation.js` inside the existing contact/target-detail
surface. `act` routes the structured intent `{appearanceId,revision,verb}` through the central
input membrane to `helpers.ionaVeyRival.action()`. For a whole-sim worker, controller declares that
one bridge and mirrors read data; do not invoke a main-thread shadow runtime. Host chooses the
ordinary hail action/key binding. No feature global key listener is installed.

Call presenter `.update()` at the HUD's normal cadence, `.destroy()` on teardown. Optional
`drawIonaClaims(canvasContext,snapshot,worldToScreen)` draws static 32-segment work/receiver rings.
Use an existing host-owned overlay, not the WebGL canvas. Native ship/wreck/rope views remain
authored renderer responsibility. All essential terms and outcomes have text; no color-only
meaning, flashing, shake, timers or animated marks. Reduced-motion needs no alternate mode.

## Focused verification and remaining qualification

Run `node --test test/pro-iona-vey-rival.test.mjs`. Tests exercise deterministic core and the actual
adapter with narrow owner doubles, including cooperation, clean rivalry, theft, cargo destruction,
third-party intervention, a completed NPC clock without arrival, reused numeric ids, stale actions,
finite source re-entry, destroyed-tug restore, bounded saves and retirement. They do not claim
native Rapier towing, boot/worker registration, authored appearance, or a headed player route.
Those remain Codex's integration, art/performance and player-truth acceptance work.

Before accepting: verify native occupational tow on the chosen clear route, hover/drop at the
receiver with ≤8 wu/s, worker input bridging, ordinary hail readability, hard and continuous sector
boundaries, save mid-rope, native restore telemetry, budget release, and deliberate tug death.
Do not update existing goldens for this candidate. No central registries or policies are edited.
