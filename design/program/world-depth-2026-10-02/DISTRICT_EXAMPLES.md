<!-- LIFETIME: DURABLE -->
# Filling out a section until it becomes a place

## Purpose and authority

The inhabited Anvil working district, described in the companion design and technical appendix, is a concrete first worked example within a broader game-wide expansion. The five bounded episodes below are committed district outcomes within the complete expansion, sequenced by the implementation packets rather than built all at once. They are not a replacement campaign or a second runtime. Work one coherent production packet at a time: inspect its actual route, infer what its people and machinery logically require, and finish the addition in the existing owners.

Research baseline: `master` at `c488ecc10c23ad613dc35c61c04f124a3b77723a`, read through GitHub on 2026-10-02. This is a source-grounded proposal, not a claim that a live playthrough was performed. Specific missing physical seams below are supported by explicit runtime comments; proposed new situations are design opportunities, not undiscovered bugs. Recheck the selected section against the current head before implementation.

The governing fantasy is already exact: a personally piloted ship interferes with a busy physical universe whose people have jobs and remember consequences. More authored people, hulls, worlds and objects are appropriate. Their distinguishing features should change what happens around the player, rather than only change a catalog entry or a line of HUD copy.

### What exists, and therefore should not be rebuilt

- `sectorWayOfLife.js` already distinguishes Helios, Ceres, Tethys, Vesta, Pallas and Sker by work, law, crime, geometry and machinery
- Ceres already has eight pocket actors and a substantial causal chain: survey, strike, actual ore transfer, customs, disabled-hauler recovery, miner service, escort and salvage aftermath
- `laneContacts.js` already provides recurrent working identities such as Rell of the Moisture Column, Kess of the Span, Tann of the Slag Run and Vey Senna; the story has a much larger named cast with registered portraits
- Ordinary tugs already tow persistent physical bodies and finite freight lots in `traffic.js`. The older occupational-hull comment saying tow is unfinished is stale
- `choirReliefBerth.js` is a strong existing exemplar: Last Light tends the physically damaged Mercy; combat owns the damage/repair; jobs own movement; death and evacuation persist. Do not build a duplicate Helios rescue tutorial
- The Kettle Line already varies discovery structurally: debris bearings lead across Ceres to a ropeable strongbox. Do not add another ring-scan chain and call it variety
- The Anvil has a canonical Atlas identity and a physical planet adapter. Separately, `planetStates.js` already authors Shatterstone, Vesta's Burn, Razor-Ring, Crown of Thorns and two Reach Scrawls. The old “ONE” wording in `planets.js` refers to its physical-site slice; it is not evidence that the whole game has one planet
- `worldOneOffs.js` deliberately includes memorable non-systemic texture. A shrine or frozen disaster need not become a quest dispenser. Preserve that quiet worldbuilding

The opportunity is not merely more entries. It is to complete and connect the nouns already present, then add the particular people and hardware a selected place genuinely lacks.

## 1. Ceres: the survey that changes the working face

**Committed follow-on, after the selected first district.** Trace current consumers and finish any remaining physical omissions inside the existing Ceres chain. This has a more defensible payoff than adding a ninth generic NPC or a second mining-event framework.

### The authored situation

Rell's working rig is following the surveyor's probe line. One face can be cut safely; a loaded overhang is pulling the line out of alignment. The surveyor stakes actual little instrument bodies in three different working positions. The miner changes its approach because of what those instruments find. Cutting the unstable face releases a real section of rock, opens an accessible richer surface, and changes the route the hauler must take.

Keep Rell's existing identity and the current Ceres cast slots. Give the surveyor and tender distinct local working identities attached to those slots, with stable callsigns, paint placement and remembered outcomes. They need not be new major story characters. A surveyor who reclaims damaged instruments and a tender who keeps an old miner alive are different people because of their behavior before they speak.

### Reuse and exact omission

- `src/systems/traffic.js`: `CERES_CAUSAL_CHAIN`, `ev_surveyor_probe_line`, `ev_rock_calving`, `ev_cargo_capsule_launch`, real miner/hauler custody and service incidents
- `src/data/sectorActivityPockets.js`: `ceres_seam_miner`, `ceres_seam_surveyor`, `ceres_refinery_hauler`, `ceres_refinery_tender`; retain current actor identities and routes where still valid
- `src/data/laneContacts.js`: `lane_rell_moisture`
- Existing mining, field depletion, dynamic physics, salvage and world-record ownership; existing prospector-skiff and yard-tug hull bindings

The inspected runtime comments identify three candidate gaps; verify their current consumers before implementation, because other occupational comments have proved stale: probes are ordinary pickups which projectiles cannot hit; capsule crack-and-scatter is unwired; calving has no persistent asteroid-body split. A phase named `calve` and a reward bonus are not the same thing as a rock visibly breaking free.

### New work and assets

Build the narrow persistent calved-body transition, then physical survey instruments. Reuse the current asteroid surface/fragment language; only author a new fracture pair if the existing meshes cannot show a fresh face and a believable detached piece. A purpose-built probe needs an anchored/deployed read, a recoverable body and a damaged read. Do not use a generic loot sparkle as the instrument. Capsule fracture can follow as the next section-local addition; it need not delay the first complete survey/calving episode.

New names and portrait art for the two local workers are authoring, not a new faction or campaign. First inspect whether their current slots already have canonical names; preserve those if they do.

### Authored variation and physical rules

1. Stable face: the surveyor finishes, Rell mines the seam and the refinery hauler takes the real lot
2. Disturbed survey: the player moves an instrument; the surveyor investigates/repositions it, and the work pauses or shifts to the other mapped face rather than proceeding on a false success flag
3. Early calving: a shove or collision releases the overhang; the loose mass threatens the haul path and can be towed clear, used as cover or allowed to hit something
4. Lost worker: an existing recovery/salvage branch handles the actual casualty. Do not respawn a named worker immediately to reset the scene

All displaced bodies retain their identity on departure and Continue. A broken probe is not an infinite electronics dispenser. Use one finite production lot, not one copy in the miner and another in the capsule.

**Done when:** the ordinary Ceres route contains a recognizable working cast; the same seeded shift produces visibly different geometry and work after interference; a physical fact, not a choreography timer, enables the next dependent step. Verify undisturbed, probe-displaced and calved-body-save cases with existing focused tests. No new acceptance framework is needed.

## 2. Tethys: Kess's late bag and the impound pen

**Committed later district episode; implementation packets set the order.** Make the already authored customs district operate as a place with conflicting jobs.

### The authored situation

Kess of the Span arrives on the existing priority service. A previous ore consignment is still sitting in the held-for-count pen. The inspection cutter is working the queue while a yard mover needs to clear space for the next arrival. The courier cannot simply fly through the held cargo. The player may clear a legitimate path, shift the wrong consignment into the wrong custody area, steal a load or wait and watch the staff resolve it.

The place stays funny and bureaucratic through its physical arrangement: one heavy keg, two authorities, a narrow legal path, an impatient courier. A new popup announcing “customs dispute” adds nothing if the queue and cargo do not change.

### Reuse

- `src/data/authoredPlaces.js`: `zone_tethys_tally`, already within the customs neighborhood
- `src/data/worldOneOffs.js`: `oneoff_tethys_tally_keg`, `place_ore_bulk_container`, mass 140, existing durable physical body
- `src/data/laneContacts.js`: `lane_kess_span`, `PRIORITY_COURIER_SERVICE`, stations `station_tethys` and `station_customs`
- `src/systems/traffic.js`: existing courier itinerary, inspection jobs, persistent tug custody and movement
- Existing cargo custody, law/security, station contacts and job leases
- Existing lane pin, tally post, cold locker and inspection-cutter/yard-tug visual families

Do not equate this pocket with `tethys_weigh_clamp`: the latter is a separate physical kill-machine by `poi_tethys_weigh`. Its current geometry intentionally acts behind its face. A safe civilian queue must not accidentally run through that machine because both happen to say “weigh.”

### Missing content to author

One actual district episode must connect the existing keg, courier itinerary, clearance space and custody recipient. The keg's descriptive fiction alone does not establish that dependency. Trace current consumers first; reuse any equivalent interaction already present.

Give the pen an unmistakable physical entry and receiving position. Reuse admitted lane furniture before requesting a new mesh. If it still reads as arbitrary empty space, build a small clamp cradle with visibly open/closed restraint states and accurate clearance; do not add a giant station. One local impound operator with a stable service hull is enough. Keep Hale and Kell's existing story roles and gates; do not reveal Kell's cover through ambient banter.

### Variation and consequence

- Clear passage without stealing: courier departs; the lot remains impounded
- Move cargo to its authorized berth: custody resolves once; the operator opens the working space
- Steal or rupture it: the same lot becomes loose/stolen cargo; inspection responds to witnesses and actual ownership
- Delay the courier: Kess retains that leg's lateness; the next encounter references a real prior service result, not a universal reputation penalty

**Done when:** departure is governed by actual clear passage and job state; freeing an unrelated object does not resolve the dispute; theft is not also credited as successful return; returning later shows the result. No invisible progress bar substitutes for moving the body.

## 3. Vesta: Tann works the winnow

**Committed contrasting industrial district, sequenced by the implementation packets.** Ceres works a seam; Vesta should feel like handling material around machinery that is already dangerously in motion.

### The authored situation

Tann of the Slag Run collects a real batch from the Feedstock Belt winnow and carries it to Forge Foundry. A service craft tends the discharge-side catch position. During a calm interval Tann can cross the mouth; during discharge the released mass has momentum and threatens that route. The player can help gather a scattered lot, steal one, time a slingshot through the flow, or push an attacker into it.

This is an addition to an existing machine, not a proposal for a new generic heat aura. The foundry's rhythm should be learned from its body, working lights, moving material and ship timing.

### Reuse

- `src/data/environmentalMachinery.js`: `VESTA_ORE_WINNOW`, `zone_vesta_belt`, `f_vesta_3`, local center `(120, 980)`; 5-second gather, 2-second warning, 3-second discharge, 6-second calm; existing `place_conveyor_truss` banks and field-kernel forces
- `src/data/laneContacts.js`: `lane_tann_slag_carrier`, `SLAG-RUN`, current Mule identity
- `src/data/sectorWayOfLife.js`: ore-in/modules-out foundry; `station_forge`
- Existing finite freight manifests, NPC jobs, mining output and physical cargo machinery

The runtime already owns winnow timing. Do not add a second per-visit cycle or animate material that the physics kernel does not move. Preserve the Runaway Ladle as a memorable background incident rather than recruiting it into every job.

### New authored work and art

Attach one named collection/dispatch cycle to actual output and consumption. Compose ordinary success, interrupted collection and spilled return; do not merely add another hauler spawn weight. Tann's loaded posture, careful approach and a distinctive patched cargo rack should make the pilot recognizable at flight scale.

Reuse the Mule body, conveyor banks and physical freight. A removable slag-bin/catch-cradle kit is justified only if existing cargo models cannot communicate capture and release. It needs an open throat and a collision envelope matching that opening. A second service pilot can be locally authored with a specific repaired-hull silhouette, rather than another anonymous tender.

### Variation and consequence

- Complete batch: actual delivered units feed the station through the economy owner
- Spill: a finite number of recoverable pieces leave the same manifest; the returning ship is visibly underloaded
- Jam or collision: service work addresses the real obstructing object; it cannot “repair” a missing load with a timer
- Theft: Tann finishes with a short load and remembers the responsible ship if witnessed; the commodity does not regenerate when the player crosses the sector boundary

**Done when:** a player can tell gather from discharge without reading text, the hauler takes a physically sensible path, and observed delivered/spilled/stolen totals reconcile. Weather and machine fields compose honestly; no arbitrary ship-only immunity.

## 4. Pallas: a salvage crew with a working reef edge

**Strong next place, with a small new local cast.** Give Pallas a livelihood that uses its existing hazard rather than transplanting Ceres's mining script.

### The authored situation

A small salvage crew stages a cut piece at the calm edge of the debris reef. Its cutter works the wreck, a tug holds the extracted section, and a carrier waits outside the surge cone. The crew has learned the rhythm: cut, hold, wait, transfer. A surge before the handoff can turn the whole string into a pinball incident. The player can recover the loose piece, protect the tug, take the material, or intentionally disrupt the line.

Use two new minor local humans if no current cast fits: an experienced cutter who refuses an unsafe pull, and a younger tug pilot who will risk a shortcut. Working names should remain provisional until checked against the existing canon; do not relocate Dustwife Senna from Sedna or Coldburn Rey from Reach merely to borrow recognizable names. Rell may be encountered on the existing Ceres/Pallas assignment, but is not automatically the owner of a new salvage company.

### Reuse and placement

- `src/data/environmentalMachinery.js`: `PALLAS_REEF_SITE_ID`, existing cone, warning/surge/calm phases and five physical mine bodies
- `src/data/sectorWayOfLife.js`: Drift Market, Smuggler Den, thin oversight and reef pinball
- Existing salvage source claims, finite extraction, cutter jobs and `traffic.js` yard-tug body rules
- Existing `scrap_sweeper` and `yard_tug` released hull bindings; current wreck/spar/cargo families

Author a safe staging pocket adjacent to the reef's actual field geometry, not at a guessed global coordinate. Check it against station approaches, the Quiessence and current wreck/discovery placements. Leave the Erased as deliberate unsettling texture; do not silently rewrite its meaning into this routine.

### New work and asset needs

The new content is the crew's shared work and conflict, plus an extracted wreck section that remains the same section from cutting to sale. Generic NPC salvagers and real tugs already exist. Only add the handoff/holding behavior needed to join them, using existing authorities.

A stable paired identity needs hull markings visible from above and persistent named records; portraits can follow the station-contact registry if those people are given an actual dock presence. A salvage bridle with a readable load attachment is worthwhile if existing tow presentation cannot distinguish “holding a dangerous cut” from “passing a wreck.” No new capital hull is required.

### Variation and consequence

The same place has three authored work conditions: a clean light cut, an awkward heavy cut requiring a long calm window, and a previously damaged piece whose integrity makes collision risky. The latter two must change mass/geometry/handling, not just rewards. A failed pull leaves the real casualty and salvage. A surviving crew can return with repairs and a safer staging choice; a dead pilot does not return with an unchanged greeting.

**Done when:** ordinary Pallas play offers a noncombat situation structurally different from Ceres and Vesta; both player and crew obey the same reef forces; two visits reveal continuity; neither crew extraction nor player recovery duplicates the source pool.

## 5. Existing planets become destinations: Razor-Ring first

**Admitted-world deepening; larger than the first four.** Expand the already authored planetary roster through playable orbital workplaces before inventing additional planet names.

### The authored situation

A crewed crystalline cut lies in the near playable reach of Razor-Ring. A miner works one edge while a tug retrieves a fractured load through a safe break. The planet and its ring dominate the distant view, but the local ring segment, work bodies, crossing hazard and retrieval route are tangible. A player can read the gap, time the return, pull a loaded pod, or lose cargo into the dangerous crossing.

The story is already specified by `design/depth-program/BUILD_PLAN.md` §3-E: industry continues despite crew losses. Preserve that. The later Crown of Thorns variant should use wreck shards and fleet history, not recolor the same crystalline field and call it another world.

### Reuse and unresolved integration

- `src/data/planetStates.js`: `planet_razor_ring` in Vesta, `planet_crown_of_thorns` in Sker; crystalline mining, kinetic crossing and wreck/black-box hooks are already authored
- `src/data/planets.js` and `src/systems/planetRuntime.js`: the Anvil's canonical Atlas-to-visual/physics/field registration pattern, not its numerical gravity/heat settings copied blindly
- Current planetary render owners, scanner identity, mining/cargo/field systems and occupational hulls
- Existing crystalline asteroid and wreck-fragment asset families

The planetary state data describes future hooks, while the inspected `planetRuntime` is the Anvil adapter. Scanner presence and a distant image do not prove those orbital work hooks are physically integrated. Trace each hook's live consumer before claiming it missing or complete. Preserve the planet's existing body ID and keep distant sky representation separate from the local playable geometry without contradictory location or scale.

### Genuine additions

One authored near-ring worksite with safe approach geometry, one specific mining crew, tangible ring material, and a verified crossing consequence. New art should be a close-range ring-material/working-clamp kit if existing pieces cannot meet that visual need, not another whole spherical planet. Never simulate an astronomical ring as thousands of live rigid bodies; keep distant material instanced and promote only the bounded authored near worksite to physical authority.

**Done when:** an ordinary Adventure route leads to a physically playable place whose ring is relevant to flight and work; the crossing is readable before it hurts; a successful recovery and a botched crossing leave different persistent outcomes. No landing, orbital-simulator controls or unrelated minigame.

## Finite district scope and protected boundaries

### Chosen episodes, delivered through existing owners

- Investigate and finish Ceres's candidate physical survey/calving seams where current consumers confirm they remain incomplete
- Complete Tethys, Vesta and Pallas through the concrete bounded episodes above, after checking for newer equivalent work
- Add minor local workers, distinct visible hull details, working props and authored variations that support the selected place
- Extend already authored planets through their existing depth-program scope and current registration/physics rules
- Reuse systems, but build genuinely missing meshes or behaviors when a prop or role cannot honestly perform its promised job

These are production choices an agent should make while owning a section. They should not require a fresh planning committee or artificial owner-review gate.

### Boundaries: do not introduce these as incidental district work

- Coordinate new major factions, alien species or robot lines with the existing alien/Vethari/automaton programs rather than duplicating or contradicting them
- Rewriting named story characters, their homes, secrets, relationships or campaign gates
- Promoting a decorative planet into a lethal physical world without preserving current routes, scale and existing authored planetary scope
- Changing faction law, permanent protagonist consequences or major economy progression to accommodate a small local episode
- Landing, on-foot scenes, dialogue-heavy RPG structure or a galaxy-wide workforce simulation

## Cross-district play: one object can matter in more than one way

The finite expansion commits to the five episodes above and Ceres's structural shipbreak in [TARGET](TARGET.md), not every possible planetary workplace or every conceivable institution. Their shared payoff is a bounded material/recovery chain, integrated with existing manifests, recipes, jobs, custody and persistent people. Do not force the player to complete the entire chain in sequence: each district remains independently worth visiting.

- **Ceres, dismantling:** one canonical long retired hull has three authored removable masses and two readable passages. A visible brace/cut/release changes clearance. A recovered piece can be sold, used as moving cover, or delivered for a single fixed-site recovery anchor. This is an alternative disposition of the same material, not three rewards. Keep survey/calving work and shipbreaking distinct in silhouette and purpose.
- **Tethys, circulation:** the held lot is a real obstruction and legal problem. The player can clear the legitimate corridor, divert the load, draw a pursuer through the open pen or wait for honest staff work. A queue resolving changes actual traffic timing. Witnessed theft changes custody/law; merely being nearby does not implicate the player.
- **Vesta, timing and fabrication:** the gather-warning-discharge-calm cycle creates a voluntary stunt line and a combat hazard as well as a job. An admitted finite delivery feeds one current fabrication/repair recipe and produces an actual outbound lot. If the required recipe already exists, wire it; do not add a competing production meter or invent an inexhaustible district resource.
- **Pallas, holding and rescue:** the tug's heavy cut must physically fit the calm staging pocket. A player can protect it, take it, hold the loose piece until the surge passes or exploit the surge against an attacker. Recovered useful machinery can satisfy the selected repair site's demand through ordinary cargo/receipt ownership. A survivor later stages farther from the reef after an actual failed pull; no fictional adaptive-learning system is necessary.
- **Razor-Ring, crossing:** geometry and the miner/tug's movement expose a safe break and a dangerous shorter crossing. Ordinary flight remains an option; a recovery build can carry an awkward prize that changes the approach. The near-ring cut produces finite work and a durable casualty/recovery outcome, while the astronomical ring stays a cheap distant image.

One admitted Anvil consignment can encounter Tethys inspection and support a finite Vesta repair/fabrication lot; Pallas/Ceres recovery can provide a selected service site's component. Select exact existing commodity/recipe compatibility in the integration packet rather than declaring that any gas automatically becomes any machine. This joins existing economic facts; it does not require a new supply-chain simulator, mandatory cross-sector fetch quest or global economy rebalance.

### Changed places must remain useful

The recovery anchor and Stormshift's second berth position are the expansion's two bounded player-authored infrastructure outcomes. Each has one fixed site, visible installation, finite inputs, actual traffic/service use, damage/repair where supported and persistent identity. No unlimited building grid or automated resource farm is implied. Ordinary replacement stock provides a recovery path if the special piece is lost; the unique recovered object's provenance stays unique.

Return visits show material outcomes before dialogue explains them: missing beam, reopened pen, produced lot, patched tug, installed rack, shifted work path. A worker response references the event they could actually witness. A destroyed person remains absent; a replacement has a distinct identity. Avoid multiplying global reputation penalties or making all districts react to an unwitnessed local accident.

### Per-place art and performance pass

For each episode inspect its hero model, functional mechanism, cargo/attachment anatomy and damaged/working state separately at the gameplay camera. Then inspect the full ordinary route: maneuvering clearance, warning visibility, player occlusion, work timing and silhouette under actual local lighting. The source inventory alone cannot pass this review.

Compare the unchanged route and the finished route in repeatable normal-work, disrupted-work and return/Continue cases. Profile the live bodies, effect bursts, draw/material cost and state handoffs that episode adds. Improve the costly or unreadable model/system individually, then re-run the complete chain. Reuse existing tests and graphics/performance tooling; expand only the narrow missing probe. A distant decorative ring never becomes thousands of live bodies, and a hidden collision slab never substitutes for a visibly open work cradle.

## A section is complete when the player can tell its story

A useful INFERENCE outcome is not “added four props, six barks and three tests.” It is: “The survey crew now stakes instruments that can be displaced; the resulting cut physically changes the seam; the refinery hauler takes the ore around that change; interrupting the shift leaves recoverable work and recognizable survivors.”

For each selected section, establish: where the player meets it, who is working, what material is moving, what the player can physically change, what survives departure, and which other existing activity can intersect it. Complete one connected episode, then return and find the next real weakness in that place. A receipt, screen label or extra catalog row cannot close a physical omission.

Do not turn every scene into conflict. Helios still needs calm; memorials still need silence; a functioning shift is valuable before anyone wrecks it. Distinct normal life makes the disruption matter.

## Source map

All links are pinned to the inspected baseline:

- [Owner vision](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/VISION.md) and [Expansion Program](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/program/EXPANSION_PROGRAM.md)
- [Depth-program index](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/depth-program/README.md) and [existing build plan](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/depth-program/BUILD_PLAN.md)
- [Live traffic and Ceres causal chain](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/systems/traffic.js), [activity pockets](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/sectorActivityPockets.js), [lane contacts](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/laneContacts.js)
- [Environmental machinery](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/environmentalMachinery.js), [authored places](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/authoredPlaces.js), [one-offs](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/worldOneOffs.js)
- [Choir relief embodiment](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/systems/choirReliefBerth.js), [Kettle Line](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/kettleLine.js), [contact canon](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/story/campaign47a/embodiedDialogue.js)
- [Occupational hull bindings](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/occupationalTrafficCraft.js), [yard admission caveats](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/occupationalYardDressing.js), [world-site asset bindings](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/worldSiteAssetBindings.js)
- [Planet states](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/planetStates.js), [physical planetary data](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/planets.js), [Anvil runtime](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/systems/planetRuntime.js)

## Asset ambition is not a reuse contest

These examples cite existing bindings to avoid rebuilding solved plumbing, not to constrain the imagination to whatever meshes are already packaged. The mature content target includes actual new occupational hull families, region-specific industrial structures, inhabited orbital installations, close-range planetary work geometry, damage/repair states and character art. Design each place's finished identity first. Then separate genuinely reusable parts from new hero forms and missing functional mechanisms. A dedicated ship or structure is justified by the experience it makes possible and the identity it contributes; it does not have to apologize for failing to fit an existing primitive.

For example, Pallas ultimately deserves a recognizable cutting ship with a load bridle and protected operator station, not an indefinitely reused sweeper; Vesta deserves machinery designed to visibly gather and throw mass, not generic blocks with an invisible force cone; Tethys deserves an inspection installation whose architecture makes its procedure legible. The first staged implementation may borrow assets, but the plan must record that gap honestly instead of declaring the district visually finished.
