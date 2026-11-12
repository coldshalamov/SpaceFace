# Cinderglass: freight as cover, not invisible permission

Exact parent: PR982 `4826abb023ec6b6ebdfa2450ac4ed0ae878bfcf9`.
This follows [the law-active service approach](CINDERGLASS_SERVICE_APPROACH_2026-11-12.md).

## Creative decision and physical toolbox

The inspection should make the player read work in progress: Dask holds the paid
consignment, the two escorts cover the outer freight lanes, and the original sealed
controller pod offers a close blind side. The player scans the actual hardware,
flies around the cargo rather than through the Mule, matches drift, keeps the latch
visible and completes five seconds of service. Exposure still interrupts it.
Negotiation and unlawful force remain intact alternatives. A quiet release is not
payment, lawful title transfer, a safe getaway or a completed delivery.

- [convoy.js](../../../src/features/cinderglassJob/convoy.js) creates the same 18t,
  radius5 sealed original. It now opts into ordinary `sensorBlocking`, which uses
  its actual physical shape. No artificial sight bubble or extra prop is added.
- [definition.js](../../../src/features/cinderglassJob/definition.js) gives the two
  existing escort itineraries separated outer-perimeter inspection points
  `(-2050,1100)` and `(-1200,650)`, sector-local. The same native ships must fly
  there. Their other route legs, speeds, authority and collision remain unchanged.
- [interception.js](../../../src/features/cinderglassJob/interception.js) retains
  all scanner, witness, speed, range, five-second service and canonical release
  gates. Its scan record explains the shell's cover only when that physical pod
  actually has the occlusion flag.
- [lawSecurity.js](../../../src/systems/lawSecurity.js) and
  [lineOfSight.js](../../../src/combat/lineOfSight.js) already support explicit
  payload occluders. Their defaults do not treat a generic payload as opaque.
  They are read-only dependencies, not modified by this increment.

No new asset wishlist: reuse of original sealed freight and the existing two
escorts satisfies this scene need. Gantry placement stays unchanged.

## Investigation and rejected alternatives

A coarse 5WU grid at the original inspection sampled489 points within service
reach at18 times across34 seconds. Early frames include14 total sample instances
that were both unwatched and latch-visible; later gantry-shielded points generally
also occlude access. This is a geometric diagnostic, NOT proof that no other route
exists and NOT a playable traversal. One modest gantry relocation changed the
carrier's settling turn but provided no demonstrated usable approach; rejected.

Best fitted cloak floor is168WU, whereas latch reach plus carrier/latch offset is
roughly86WU. The cloak is not a substitute for close cover from Dask. Pod occlusion
alone gives more geometric blind-side positions, but the matched native actor
remained watched by an escort. Moving the actual patrol coverage, not disabling
witness logic, creates a useful choice between public negotiation and physical
concealment.

## Native evidence, not rendered or earned campaign acceptance

Seed4242; staged post-alloy operation with Kestrel at pull-off+(110,70),5000credits.
Native world, Rapier, flight, scanner, tactical AI, AI ports, law, factions, heat,
combat, cargo, economy, npcJobs and feature owners are active. Presentation receipt
is fixture-acknowledged. No later live-body relocation, seeded scan, disabled
witness, custody write or route-index jump occurs. Actor uses normal scanner input,
public course intents and the exposed service action, not a teleport or gate call.

Matched parent run: real scan58.1s, actual inspection75.2667s, no service release
by115.0833s; pod still carried, hull140. Pod-only candidate likewise failed to
complete. Full scene: scan58.1s, inspection75.2667s, one five-second service ends
97.9s; native clamp removed, same original released intact, approach quiet, hull140,
no deposit, suspicion0,11.3667s inspection time remains. Independent reviewer
repeated the native full-scene result at97.9s. This proves this staged approach,
not every heading, ordinary New Game-to-alloy, outbound tow or receiver acceptance.

Scoped checks:3 blind-side/save tests,4 native physical tests and17 inspection
extension/radio/guidance regressions passed (24 unique checks). The physical
route test completed at213.55s with18t original; this is not a performance target.

## Persistence and limits

New-operation saves retain the original pod's occlusion metadata and actual escort
itineraries. Focused native save/restore checks verify both and one original.
Already-running old saves retain their old routes and pod metadata. There is no
mid-route migration, reset, fresh convoy or restarted inspection. The cover hint
is conditional so it does not promise new shell behavior for an old pod.

Visual composition, escort readability, different player hulls, a full earned
campaign journey, continuing mid-service, towing to Tala and final acceptance
remain open. No screenshot/render review is claimed.

## Open goal continuation

| Marker | Outcome/state | Owner | Evidence | Next executable action | User-dependent |
|---|---|---|---|---|---|
| SF-WORLD-DIRECTION | Working freight routines explain choices; staged physical slice verified | Adventure direction | Native matched approach above | Review radio/scan-to-approach pacing in rendered play | Final acceptance |
| SF-SECTOR-COHERENCE | Inspection/patrol/blind-side geometry connected; not whole Tethys | Scene integration | Existing three bodies and real routes | Inspect outer patrol landmarks/clearance and other entry headings | Final acceptance |
| SF-LIVING-WORLD | Escorts retain actual travel and witness authority | Native route owner | Unchanged witness gates and source | Verify departure/rejoin and return visit after recovery | None for authorized test |
| SF-GAME | Quiet original release demonstrated from staged setup, not completed mission | Integration reviewer | Parent negative/full-scene positive | Earn opening→alloy→quiet recovery→tow→Tala and Continue | Final acceptance |

No goal closes from this source change or tests. Original twenty-concept scope is
unchanged; this is one authored use of the existing cargo/sightline toolbox.
