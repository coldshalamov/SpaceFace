# Morrowlight — personal salvage tender

> Local integration: this feature is now wired into the production browser/Node registries, public interaction, save/reset, worker transport and existing presentation owners. Commission-time integration instructions below describe those seams; no feature flag is required.

Candidate for `coldshalamov/SpaceFace`, built against the exact shipped base
`34310c836bf80216b869331c54b777c231a637ee`.

Morrowlight is one battered, persistent service barge. The player physically recovers
its original hull, repairs useful machines one at a time, and uses recovered supplies
to prepare the next departure. Its three finite recovery loads make the complete
progression possible with zero credits. Nothing about inspecting the barge, unloading
a nearby crate, or leaving its encounter grants ownership.

This scoped candidate includes live simulation, physics, service, save, prompt,
read-model, encounter and presentation adapters. Shared registration and rendering
files are deliberately outside this commission. Apply every required seam in
[INTEGRATION.md](INTEGRATION.md) before full-game acceptance. See
[ACCEPTANCE.md](ACCEPTANCE.md) for measured checks and concrete limits.

## The player loop

1. In ordinary Adventure, visit Helios or Ceres. The encounter offers inspection;
   a fallback finds a clear pocket near a station after 90 seconds of simulation.
   The encounter and fallback address the same durable barge. No console command is
   needed. Proximity and completed scans reopen contextual promptDeck cards.
2. Inspect or leave. The offer explains the value of the fuel pump, the first cost,
   the rescue distance and the nearby emergency locker. Refusing is free; returning
   finds the same condition and remaining cargo.
3. Match the emergency locker's speed within 75 m and recover what fits. Transfer
   goes through the ordinary cargo owner. A full hold leaves the remainder in that
   same physical pod. The available unsealed parts and credits appear in the claim
   and restoration cards.
4. Accept recovery and connect the Massline. Tow the actual hull at least 60 m from
   its original position into the marked clear berth, approximately 110 m away.
   Slow the barge and relative approach below 8 m/s. The claim card reappears at the
   safe stop. Tap thrust gently: the tender keeps coasting after the tug brakes.
   Chart marks do not engage autopilot during towing.
5. Claim the barge with one unsealed electronics unit or 45 cr. The berth lamp and
   fuel pump work immediately. The first claim grants one limited emergency weld.
6. Prepare fuel or repairs, go to a normal job or one of the remaining real recovery
   loads, and return. The log records departures, arrivals, installations, damage,
   repairs and relocation. Use the recovered parts to wake the next dead machine.
7. Once owned, release the mooring brake with one scrap and tow Morrowlight to a
   different location in its sector. Resume an interrupted tow without paying
   again. Secure it at its real low-speed position. The same hull, machines,
   condition, remembered work and racked pod remain yours.

## Three useful stages

| Stage | Installation | Immediate capability | Authored deck change |
| --- | --- | --- | --- |
| 1 — Lantern Berth | 1 salvage electronics **or** 45 cr, after physical rescue | Home fix; one fuel cell pumps up to 25 fuel; one starter weld brings hull up to 35% | Repaired power skid and steady berth lamp |
| 2 — Working Bench | 4 scrap + 2 electronics **or** 180 cr | One scrap repairs up to 20 combined hull/armor; unfinished paid work waits for the same ship | Bent scaffold replaced by the working repair bench |
| 3 — Expedition Tender | 6 scrap + 3 electronics **or** 320 cr | Twice the service rate; rack one original stocked supply pod and tow it with the home | Working container rack and active machinery |

An installation is an atomic transaction. Partial restoration means the already
installed stage remains useful while the next parts are being recovered. Timed
fuel and repair work separately persists its actual delivered and remaining amount.
Leaving the berth pauses that work. An untouched whole cell or scrap can be returned
if the normal hold has room; cancelling partly used material spends that material.

Services require the same sector, a working secured barge, actual native physics
admission, a live player within 100 m, and relative speed below 8 m/s. The rack takes
one of the three original recovery pods, not arbitrary inventory items. Its supplies
must be unloaded into the normal hold before installation or service. There is no
parallel player inventory or wallet.

## Meaningful condition without unattended destruction

The battered hull starts at 68/160. One unsealed scrap repairs up to 30 tender hull
through the existing yard's hull-delivery writer. Damage at or below 24 disables
the machinery. The combat damage event occurs before its death decision, allowing
that same existing writer to preserve a one-point disabled original. Patching above
the threshold restores operation. This is explicit disabled-object behavior, not
a destroyed hull being replaced.

The tender and its owned racked pod are sheltered beyond 900 m or while the player
is in another sector. Nearby play keeps physical vulnerability; a broken rack line
leaves the same pod loose. Loose recovery cargo is not remotely protected. If an
external owner actually removes an original, its record becomes missing/lost and
no replacement or refill is manufactured. Copied public identity markers cannot
take over a known missing body, even after repeated lookups.

## Ownership and implementation

| Feature file | Responsibility | Existing authoritative owner |
| --- | --- | --- |
| `runtime.js` | One progression/service coordinator; ordinary admission, physical gates, contextual actions and memory | Registry fixed clock, world navigation, event bus |
| `physical.js` | Original-body custody, native admission, bounded berth control, finite pod manifests and real rack/tow constraints | Physics authority, Rapier, combat attachments, cargo |
| `services.js` | Exact installation transaction, booked work, partial delivery and cancellation | Economy credit fence, cargo add/remove, stationServices delivery |
| `model.js` | Detached bounded progression/save rows and the three stage definitions | No foreign writer |
| `saveAdapter.js` | Instance extension of both canonical capture lanes and the canonical restore generator | Save envelope, checksum, rollback, persistent bodies and native remapping |
| `prompts.js` | Stable revision-bearing decision cards | promptDeck owns keyboard, touch, controller and accessibility |
| `readModel.js` | Detached costs, capabilities, supplies, production map marker and authored hull selector | Reads actual hold, body, physical manifest and saved pose; existing map coordinates/stable selections |
| `presentation.js` | Three authored equipment pairs, restrained local cues, render/reset cleanup | Existing asset leases, render packages, presented hull transform and audio bus |

The physical world identity is `pro:salvageTender:morrowlight`. Each finite crate
has its own stable world-record and manifest identity. Numeric entity IDs are
short-lived and are rebound only after the save owner has reconstructed/remapped
the authoritative persistent bodies. Live bindings also check object identity and
occupant generation. Ordinary sector residency preserves the actual global pose.

Towing uses the combat attachment owner and native constraints. Secured station
keeping submits bounded force and torque through the physics control membrane after
flight and before physics. It does not write a post-spawn pose, snap a pod onto the
deck, or drag a new copy behind the player.

Payments use the existing `economy:chargeCredits` exact transaction fence, including
the parts-only zero-credit transaction. Sealed freight is excluded through the
existing sellable-quantity reader. Service progress uses the existing
`stationServices._applyJobDelta` writer with a physically checked service berth;
the player is never falsely marked docked. Public actions are revision-fenced and
non-reentrant, and completion is committed before its receipt is emitted.

## Presentation and limitations

The hull is the existing `wholeships/repair_tender.glb`, selected by an explicit
render-only identity. It must not receive `trafficRole: 'tender'`: the ordinary
traffic owner would then adopt the home. The six equipment assets already appear
in the base render manifest. The deck owner follows the presented hull matrix and
leases authored instances; it never clones or disposes shared hull resources.

Reduced motion stops tool motion and lamp breathing. Reduced flash steadies lamps.
Audio is local, rate-limited and uses existing gesture-gated recipes, with captions.
New Game, Continue, sector exit and destruction dispose the presentation owner and
cancel late asset admission. Missing authored equipment remains a diagnostic rather
than creating a substitute model.

This candidate targets the base's normal main simulation lane. Experimental worker
event/mirror wiring is not supplied. Relocation stays within one sector; navigation
can plot a route back to the home sector. No intersector towing, arbitrary pod storage,
new input binding, CSS, package change, generated asset, or companion Pro feature is
required or claimed.

The supplied exact source omits binary assets and some large files. Focused native
simulation and real-Three lifecycle tests establish behavior and ownership, not the
finished visual composition, handling enjoyment, controller ergonomics or GPU cost.
The fully integrated Adventure player-truth route remains a local acceptance step.
