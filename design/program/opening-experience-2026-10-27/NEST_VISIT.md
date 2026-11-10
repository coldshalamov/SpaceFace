# Compost → the Nest → Registry Writ

Reviewed source increment, 27 October 2026. Ordinary live-game and final visual acceptance remain open.
Source baseline: PR637 at synchronized `03d6bd572176b506fb332cca3e89fdebfa2a2de2`.

This is connected Book2 assembly under the existing [build map](../../../build_map.md), not a new competing feature queue. [Sector coverage](SECTOR_EXPERIENCES.md) distinguishes inspected routes from the wider unreviewed world.

## Why this belongs here

The opening has taught the player that matter has owners, weight and destinations.
Helios makes a claim into actual ore; Tethys inspects a real consignment; Ceres
distinguishes disposal from loss; Rook pays for a retained hull. Compost gives the
same material a different use: a wreck can become living infrastructure instead
of money. The next scene should test that learned physical vocabulary, not erase
it with a disconnected arena or demand an unexplained equipment upgrade.

The existing Reach Nest already provides the contrast: a carrier produces living
attackers, and those attackers can become physical ammunition. This is an
experience interpretation of existing systems, not new faction canon. Do not
assert that Reach engineered the Understory, that the receiver supplies the
carrier, or that one character secretly controls both. No inspected source
establishes those causal claims.

`src/data/factions/reach.js` grounds the opposing identity: Crimson Reach controls
lawless sectors and ambush lanes, has separate raid-pack and prize-crew roles,
and explicitly lists Atlas/Colossus hulls for its Nest-carrier role. A salvaged
freighter used as a launch platform therefore fits the authored faction better
than a fighter merely named “carrier.” Its neutral numeric relation with the
Understory is not evidence of an alliance. The player's immediate stake is a
dangerous working lane and their own passage, not an invented galaxy-saving
assignment. Show the carrier doing its work before asking the player to stop it.

## Observed gaps to close

- `missions._storyWaypointForBeat` describes the Nest but supplies no position or
  target. A mission name is not a place the player can find.
- Encounter705 is in a weighted patrol deck. It is implemented but not guaranteed
  to appear along the route assigned by the story.
- The current campaign predicate accepts any matching encounter resolution,
  including `aborted:no_cast`. Leaving a failed setup must not become a victory.
- The current save projection omits active carrier/door/Wasp progress. A fresh
  cast after Continue is not an honest continuation of a half-finished fight.
- The source calls the ship a carrier but creates a Corsair, and creates generic
  beacon doors with no asset reference. Labels alone do not establish visual
  identity or physical readability.
- Comments promise later raids, a trophy wall and a retained wreck. Their actual
  consumers/persistence are not all established. Do not advertise those promises
  as completed consequences.

## Intended playable sequence

1. Genuine retained Compost growth closes that book beat. The player receives a
   navigable, measured approach on Charon, not a random encounter lottery.
2. The approach explains what is ahead before the pilot crosses into pressure:
   a Reach carrier, cycling bays, small launched Wasps and a route back out.
   The receiver remains a real place behind them, not an arena entrance that
   silently deletes the previous world.
3. At contact, identify carrier and doors separately. Existing asset composition
   must make the doors selectable and their mass legible. Do not encourage a
   Class I pilot to pull a 400-tonne plate as if that will work.
4. Preserve ordinary guns and escape. For a suitable Line, physically returning
   a real Wasp is another option. A stale latch mark followed by a distant death
   must not count as a bay hit. Door removal should visibly change the available
   opening and launch pressure rather than only increment a number.
5. Genuine clear and deliberate escape are distinct valid outcomes. Player loss,
   admission failure, teardown and restore are not either outcome. A terminal
   receipt cannot pay, hang a duplicate trophy or resurrect a fresh cast twice.
6. The existing Tethys Registry Writ becomes the next readable destination only
   after an authentic outcome. Preserve Elroy identification and force/custody
   options; this encounter is not permission to rewrite that later chapter.

## Persistence and return contract

Save before contact must retain a pending reachable visit. Save during contact
must retain the actual partial encounter or a clearly recorded world outcome,
not refill doors, launch budget or damage. Returning after a terminal outcome
must respect that outcome. Actual live identifiers must be rebound by durable
ownership, not accidentally reused IDs. Concurrent random Nest admission must
be adopted or prevented from duplicating the authored visit.

## Asset reuse and ownership

The existing Atlas ship, released cargo-module plates and Ashline Wasp provide
potential visual pieces. They require measured fit and admission review, not new
model production. The separate capital-boss Nest score is not this encounter:
copying it wholesale would change difficulty, lifecycle and scope. Preserve its
owner. Prefer actor-owned packaged identities; any renderer seam stays additive.

## Qualification still required

Record exact implemented paths and outcome tests when the source is frozen.
Run ordinary admission, capacity/pacing deferral, wrong mode/sector, partial
Continue, leave/return, both genuine terminal routes and abort rejection. Compose
the actual Compost producer and existing Registry handoff rather than emitting
synthetic positive campaign events. Inspect actual exported geometry and visual
composition, then native flight/Line/save behavior and live game-camera quality
when a supported route is available. Source adapters and offline renders are
useful evidence but cannot close those latter acceptance gates.


## Implemented source and actual qualification

The authored berth is Charon-local(200,-2800), global(8392,25872); the east
approach is local(850,-2800), global(9042,25872). Existing director pacing,
capacity, occupancy, Adventure/dock/race guards remain. An already-live genuine
Charon Nest is adopted instead of duplicated. Foreign-sector705 cannot silently
become a Charon cast. Genuine prior Charon completion may reconcile after Compost;
legacy completed book state remains complete.

The existing Atlas carrier uses its actual measured skin. Two 400t salvaged blast
baffles sit at localZ±24. They are existing damaged cargo modules, not newly modeled
belly doors. Their guarded/exposed coupling state is shown by a cross versus
inward chevrons, not color alone. An exposed intact assembly accepts an actual
player-handled Wasp impact; after a baffle tears away, the target moves to the
actual carrier flank. There is no pretend pass-through hole or proximity-kill disk.
The two bounded targeting guides are presentation overlays, not physical lights
or colliders. No new ship model, material family or capital-boss encounter is added.

Three distinct successful returns route damage through the existing combat owner.
Contact-force facts are copied from the pooled physics event and processed outside
its synchronous emission, preventing reentrant damage-router corruption. A remote
marked death or stationary proximity does not count. Guns and genuine living
withdrawal remain valid. Time passing alone, player death alone, setup failure,
missing actors and generic aborts do not grant success. Mutual destruction still
records actual carrier destruction without reviving the pilot. Generic stale and
mercy retirement no longer falsely dispose of this finite owned encounter.

Save projection is pure, including rollback capture. Real terminal settlement
occurs on the normal runtime path or before manual/paced/autosave capture. A
validated pending carrier-death fact can settle through the restored705 owner
without spawning a new cast, paying a second pacing charge or reviving the player.
Semantic slots preserve damage, remaining brood, consumed returns and contact
state. Exact generic-restored actors are adopted; ambiguous slots, divergent poses
and unknown missing actors fail closed. Pending terminal replay does not claim to
clean up every generic-restored survivor; those retain their existing owner.

Focused evidence: 28 route groups, 38 runtime groups plus six existing 531 groups,
11 story-authentication groups, nine Compost neighbor groups, 14 extracted actual
director/save groups and six actual Three presentation groups. These overlapping
scopes are not a whole-game test total. Actual native Rapier construction verifies
3.110235WU separation between the Atlas measured skin and each initial baffle.
A separate moving 16t measured Wasp contact produces an actual native impulse,
traverses the real impact producer, queued runtime and ordinary combat death:
seven composed combat groups pass. This is stronger than a fabricated event fixture,
but not a full live flight/aim/heat/Continue playthrough. Full local W533 cannot
start because unrelated sparse dependencies are unavailable; hosted CI is required.

Actual current exported-model previews exposed and rejected the original Z±46
floating arrangement. The revised24WU placement and smaller elevated guides were
inspected top-down and obliquely. Whole-file hatch and armor alternatives were
rendered and rejected because they are disconnected sample collections, not a
single baffle. The current salvage assembly is functionally readable provisionally;
its final visual quality remains open. See [the precise missing-piece brief](NEST_BAFFLE_ASSET_BRIEF.md)
for the local model owners. Do not start another model-production lane here.

Next executable unit after this increment's publication/CI: follow the real
Registry Writ offer, navigation, identification and force/custody route from this
actual Nest outcome, preserving its existing owner and canon. Do not mark the
whole Charon sector, Book2 or game complete from these source checks.

A released player-thrown Wasp saved before impact retains its motion and handling provenance across Continue; a new positive regression proves no proximity credit, then one real-owner contact credit without reattachment. A still-held body recreated without its physical Line requires reattachment; this is not silently treated as a restored constraint.


### Ordinary Line admission correction

Mass capacity is not the only current rule. Standard radius12 Wasps fail the live
rock-rating T0 gate even though16t is below Class I's20t capacity. Before publication,
this was reproduced through both actual nearest and preview acquisition, so the
mass-only teaching claim was rejected rather than hidden by a synthetic latch event.

Fresh, exact authored-v1 Charon visits now launch compact nursery Wasps at radius9
and16t. The existing model and measured polygon are genuinely scaled before core,
physics and render admission; this is not a fake query radius, new model-bank item,
progression grant or global rule change. Combat stats remain unchanged. Random and
legacy705 Wasps stay radius12. A strict saved broodVariant preserves that distinction,
including random-cast adoption followed by Continue through an authored request.
Null, foreign compact identity and mismatched adopted bodies are refused rather than
silently resized. Active guidance names the actual variant's prerequisites.

Five ordinary-admission groups prove both preview and nearest paths, real attachment
creation/event and standard-body rejection. The compact native positive then uses
actual attachment cut, measured Rapier contact, the actual impact producer and normal
combat return. Standing receipt, unobstructed candidate-query and constraint-handle
ports remain declared; full native rope solving and ordinary rendered input are not
claimed. Heavy400t baffles require BOTH Class III capacity and live Line rating T1;
that optional advanced branch is not unlocked merely by this encounter.
