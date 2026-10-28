<!-- LIFETIME: DURABLE -->
# Anvil working-district expansion: technical grounding

Baseline: `c488ecc10c23ad613dc35c61c04f124a3b77723a`. This is one worked district within the game-wide mature expansion, not the boundary of that expansion. It supplements the creative design with verified runtime seams. Existing assets are useful substrate, never the ceiling on the finished world.

## Why this place first

Ceres already contains a large authored working cast, physical ore handoffs, breakdowns, repairs, escort and salvage. It has useful candidate physical-object gaps, but extending it first risks delivering more of the same industrial rhythm. The Anvil already offers a different physical pleasure: fast loaded flight, slinging mass, committing to a dangerous collecting pass and recovering on a curve. A normal inhabited work cycle and a purpose-built skimmer/cradle family add both genuinely new things and a reason to use existing strong mechanics.

The place is not empty in source. The first expansion is **a recognizable working district around a functioning planet**, not “add planetary flight,” “add a gas-skiff rescue” or “add a new planet.”

## Verified live starting point

### Planet and position

`src/data/authoredPlaces.js::ZONE_TETHYS_ANVIL` owns `zone_tethys_anvil`, faction `faction_mts`, Tethys-local center `(2000, -2200)`. `src/data/planets.js::PLANET_SITE` and `src/systems/planetRuntime.js` bind that one identity to visual body, static exclusion circle, annular field, heat and reentry. Do not create a second competing “Stormshift planet” ID or duplicate the field.

At baseline the planar band edges are: reentry 800, danger 880, skim 1040, sling 1450, influence 2600 WU. These are evidence about current geometry, not new balancing prescriptions. The 700-WU visual sphere sits at Y=-520 and its actual gameplay-plane exclusion radius is 470. Any new service cradle must be placed by true clearance against those volumes, not by the sphere's rendered apparent edge.

The current attraction is deliberately annular: zero below the 900-WU inner radius, rising into the sling region and ending at 2600. It is not astrophysical gravity and must not be replaced with a trap that makes escape impossible. Field sums remain capped through the existing kernel.

### The witness that can become a person

`planetRuntime._spawnSlingWitness` currently creates a passive Mule at radius 1200 with tangential speed 70. Its spawn spec has `anvilSlingWitness`, `trafficRole:'hauler'`, passive AI and no work itinerary, cargo manifest or durable person/world-record identity in that spec.

This is the cleanest initial seam: preserve the useful “look, a body is really curving” demonstration, but adopt that body into one recurrent worker's job. Do not keep the anonymous witness and add a named lookalike beside it. Inspect later consumers first before changing its ownership. A named skimmer must survive sector residency and Continue through the existing living-world authority, not by being respawned with a label.

### Harvest is already physical, but currently player-specific

`planetRuntime._tickHarvest` reads the player, `rt.player.collectorOn`, region, speed and actual `speed * dt`. Below speed 8 it produces nothing. Skim gathers `cmdty_gas_hydrogen`; danger gathers `cmdty_gas_helium3`. Whole units settle through `cargo.addCargo`; accepted quantity drives the physical yield presentation. There is no NPC working-harvest branch in that method.

The extension needs an NPC collector/job path that uses the same geometric truth while crediting the NPC's finite manifest through the correct owner. It must not call the player's cargo method for the worker, generate cargo from elapsed “work” time while stationary, or maintain a second detached production total.

Heat and atmospheric drag already apply to tracked non-player ships, with a current cap of seven NPC ships plus player. Author a small crew and test admitted actors against that cap; do not allow the number of incidental raiders to give the skimmer accidental immunity. Raising the cap needs a measured runtime change, not a prose promise.

### The Chord is already shipped content

`src/data/encounters/351-the-chord.js` (`sling_chord`) creates a gas skiff, two raiders and seven real helium-3 pods along a radius-1180 sling arc. Pods have a skiff owner, Meridian faction and physical velocity. It keeps released actors/pods in the world instead of deleting them at encounter resolution. Its gates include story beat 1, a 780-second cooldown and the existing encounter budget.

Its successful branch fires when raiders are gone, counts pods still alive and pays `90 + 30 * intact` with a rep change. That is a combat-clear outcome. It does not show a seven-pod cargo train being delivered to a district depot. Do not mistake `curve:train_recovered` for proof of actual returned custody.

A district accident can eventually feed this encounter by adopting the district's existing skimmer and spilled lot. That is a deliberate integration change, not the first dependency. Stage one can retain The Chord as a separate encounter while avoiding duplicate cast ownership. Do not silently change its current reward, gates or story meaning just to claim it as new content.

## First production stage: one honest normal shift

Keep stage one tightly coherent:

1. One persistent named worker uses the witness slot and a new recognizably functional skimmer body
2. The worker departs one physical service cradle, flies one shallow collecting route, returns with a finite load and transfers it to a real receiving tank/lot
3. A second named service worker operates an existing rescue/tug hull at the cradle; its movement and attachment answer actual arriving or disabled bodies
4. The player can fly alongside, harvest independently, move or recover an existing load, or interfere with the transfer using current controls
5. A displaced pod, damaged collector or interrupted departure creates a visible changed state on return; no new quest UI is needed to explain the basic work

Deeper helium runs, an emergency tow, customs custody and Chord adoption extend the same district after this normal shift works. The normal shift itself is valuable production; it is not a demonstration harness.

## An authored art family with real gameplay purpose

Proposed names/IDs are design labels until reconciled with current manifests; none is claimed to exist already.

- **Working gas skimmer:** one Forge-built occupational hull. Top-down silhouette has a clear forward collection mouth, protected pilot/drive body and offset tanks. Collector open/closed state must be visible. Put the tow/load attachment and collision hull where the mesh says they are. Heat treatment and repaired panels are authored wear, not noise everywhere
- **Cold service cradle:** one compact world-site assembly, not a full new station. Open approach, tangible docking stops, articulated coupling and a berth wide enough for the chosen hull plus its load. Collision must preserve the real opening
- **Transfer tank/pod:** author a matching skimmer/cradle container, borrowing compatible production-kit parts only when they support the design with empty/loaded indicators, a coupling and a ruptured or detached state. Contents and visual state derive from the same lot, never from a decorative animation
- **Existing service hull:** use the released rescue lifter or yard tug, with a distinctive livery for the second worker. For the mature district, commission a dedicated service variant when its silhouette, handling gear or crew identity materially improves the result; a reused hull is a production stage, not the default final answer

Ship body creation must follow `tools/blender/forge/FORGE.md` and current `design/program/GRAPHICS_PROGRAM.md`. Inspect actual release manifests and runtime bindings before selecting reusable props: `occupationalYardDressing.js` contains IDs whose admission is deliberately withheld, so an entry in that table is not proof that a prop is ready to ship. Final quality must be judged at the gameplay camera with the live materials and collision footprint.

## Runtime ownership and bounded integration

- **Place identity:** existing authored Anvil zone; sub-site registration only for the cradle, preserving current Atlas authority
- **Worker identity, route and residency:** existing traffic/living-world records and NPC job ownership; do not add a parallel ambient spawner
- **Band force/heat:** `planetRuntime` plus the field/physics owners; extract shared harvest math only as required, keeping state writes in their owners
- **Inventory:** existing cargo/freight manifests, one stable source lot and explicit transfer; economy credits only when a real qualifying delivery occurs
- **Cradle components:** current world-site manifest/kernel pattern if components need damage, sockets and persistence; no private attachment physics hidden in the render file
- **Rescue:** existing Massline, combat subsystem repair and NPC job leases; reuse the Choir-relief embodiment pattern without duplicating that Helios story
- **Encounter:** `sling_chord` and encounter director remain the hostile-content owners; density is not multiplied just because a district was added
- **Return memory:** worker record and service/lot outcomes persist; seconds-lived planet heat/stage currently reset on load. Do not silently change that save contract as part of character memory

## Rules to preserve, decisions to make deliberately

The district may supply authored people, ships, props and jobs without a new overarching game law. The following are distinct rule choices, not implied by adding content:

- A cradle instantly removing heat, repairing a hull for free, immobilizing a load, or granting arbitrary immunity
- Making all gas pods explosive or adding pressure/temperature simulation to every cargo type
- Permanent pirate occupation of the Anvil: older place text says no hostile presence and pursuit-created danger, while The Chord deliberately adds a gated encounter. Preserve current encounter ownership and resolve any density change explicitly
- New mandatory upgrades or entry fees that block existing skim controls
- Changing The Chord's reward from combat clearance to delivery, or merging its skiff into the persistent crew, without compatibility and ownership work

For stage one the cradle is a working transfer berth and the skimmer obeys current band rules. Any active cooling or added thermodynamic mechanic should be an explicit later design decision with a visible mechanism, cost and shared rule for player/NPCs.

## Acceptance without paperwork replacing play

Show the ordinary Adventure route reaching the district, following a complete shift, interfering with a real load, leaving, and returning to the surviving consequence. Focused tests establish: no doubled witness; one retained worker identity; actual-path yield; inventory conservation; legal berth clearance; player and NPC band exposure; Continue during loaded return; no duplication alongside an active Chord encounter. Check frame pacing in the authored active scene, not an empty orbit.

Do not count merely reaching a named phase or writing a receipt. The player should see a particular person doing a particular job in a particular machine, understand how to interfere, and recognize the changed place next time.

## Existing plan anchors

- `design/program/EXPANSION_PROGRAM.md` §§2–4: worldbuild downward, roles, physical interactions and content variety
- `design/sequential-build-plan/REVIEW/BUILD_PLAN_CORRECTED.md` STEP 12: existing Anvil sling/skim/harvest/reentry specification, referenced by current runtime and VFX authority
- `design/program/roadmap/receipts/PQ-013-planet-REPORT.md`: historical implementation evidence, not a new active packet or current readiness verdict
- `design/program/atlas/01_DECISIONS.md`: canonical identity rulings referenced by the registration transaction
- `design/depth-program/BUILD_PLAN.md` §3-E: broader planetary identity, not evidence all distant planets are physically equivalent to the Anvil
- `design/program/GRAPHICS_PROGRAM.md` and Forge: shipping art owners

Do not invent an active `PQ-013.md` path: it was not present in the inspected active directory. Put this design into the existing current planning/INFERENCE surface selected for the implementation request; do not reopen a finished packet merely because it once built the planet.

## Mature district asset target, beyond its first working shift

The complete place should earn a distinct industrial family: two skimmer hull sizes with different load-handling profiles; an orbital service craft whose arms and cooling hardware are recognizable from above; a segmented receiving installation; articulated collector, coupling and tank hardware; damaged and repaired hull sections that preserve the machine's identity; and crew portraits tied to real recurrent people. These are genuine commissions when the existing kit cannot achieve the designed read. A row of generic tubes, a recolored Mule and a renamed cargo pickup are not the mature target.

Do not require the whole family before anything can ship. Build one finished skimmer and cradle together with their complete job, then expand from the resulting physical language. The later ships must introduce a perceptible working difference, such as a broad heavy collector that needs an outer recovery turn versus a light skiff that can exploit a narrow gap. Different skins over identical motion do not meet the target.
