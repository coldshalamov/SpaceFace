<!-- LIFETIME: DURABLE -->
# Expansion design exemplar: Stormshift at The Anvil

Chosen expansion design; implementation is dispatched through the existing world/graphics owners and the finite implementation packets. Source baseline: `c488ecc10c23ad613dc35c61c04f124a3b77723a` (2026-10-02). **Stormshift**, the new equipment names, worker identities and exact activity beats below are new design commitments subject to canon/integration checks, not claims about already shipped content.

## Role in the mature-game plan

**This is one fully designed district exemplar, not the whole expansion strategy or a ceiling on new content.** The latest owner direction is to review and expand the mature-game plan before publishing its PR, then implement the complete feature set in small commits, including graphics and performance review one model and system at a time. This district illustrates the required depth of a content unit within that larger plan. It does not justify indefinitely remixing existing assets because new 3D production is difficult.

The recommendation below selects the strongest of three candidate first playable exemplars. It does not deprioritize the game's eventual new planet identities, alien ecology, precursor machines, broad ship roster, major structures or other world regions. New large authored assets are legitimate requirements wherever the mature-game target needs them; implementation staging is not permission to shrink that target.

## Recommendation

Build **an inhabited gas-working district around the existing Anvil in Tethys**: hot skimming ships, a cold-service berth, unwieldy replacement machinery, cargo going to a real buyer, and people who keep working after the player leaves. The immediate fantasy is: **“I can come screaming around a planet, knock a whole load sideways, and turn the mess into my escape route.”** The people here work for a living; the player gets a fast physical playground, not an obligation to join their shift.

The Anvil already provides the big impossible thing. The expansion gives it a community and an industrial anatomy. Its distinguishing image is a squat ship with huge open collector jaws diving past the luminous limb, while a scarred, fan-shaped cooling rack is being dragged toward a waiting open berth. Nearby ships adjust their routes because those things are physically there.

This is a real content addition, not a repair package with a new name. It must ship at least one unmistakable new working hull, one major interactive machinery family, and a small recurring cast alongside three authored situations. Existing planet flight, cargo, encounters and physical tools are the substrate.

## Three grounded candidates

### 1. Ceres shipbreaking yard
- Grounding: Ceres already owns mining, hauling, refinery work, Wreck Cathedral and Cinder Sluice. An industrial breakup yard belongs there.
- New things: open-rib breaker ship, dismantling cradle, reusable hull sections, crews arguing through what they actually salvage.
- Best play: choose cuts, release mass, steer the aftermath, sell or reuse parts.
- Weakness for the first expansion: close to existing salvage/sluice imagery and loops. Without exceptional new articulated hardware it risks feeling like another wreck and cargo pocket.
- Good later expansion: author one enormous recognizable retired ship whose dismantling changes the local route.

### 2. Anvil gas-working district — recommended
- Grounding: The Anvil is explicitly an ocean world whose storm bands are worked by skimmers. Tethys already has trade, customs, contraband, couriers and Meridian interests.
- New things: distinct collector skimmer; fan-rack cold berth; mobile cooling rack and pressure-canister family; three recurring working people.
- Best play: fly a profitable path; recover an awkward machine; intercept stolen hardware without destroying the thing the district needs.
- Why first: it makes piloting intrinsically interesting, brings more visible life to an existing planet, and gives economics, combat, physical powers and industry one shared place. It requires no new planetary traversal model.
- Risk: the ordinary working cycle and reachable geography must be truly implemented. A staged orbital screenshot or another emergency pod event is insufficient.

### 3. Charon living-wreck corridor
- Grounding: Cinder Nursery, Warm Freighter, Three Hull Garden, Quarantine Pylon Field and Broken Shepherd already exist as authored identities. The alien plan supports colonized infrastructure, ecology manipulation and exact precursor procedures.
- New things: an infected tug/carrier relationship; tangible growth bridges; a working Shepherd/Custodian mechanism; research and quarantine personnel.
- Best play: separate living cargo, manipulate heat/route choices, restore a useful machine boundary while preserving a desired specimen.
- Why later: stronger contamination, custody, ecology and machine-behavior prerequisites; easily collapses into “fungus enemies plus a robot fight.” It also belongs farther along the established geographical mystery gradient.
- Hard canon: one biological phenomenon; Vethari off-frame; no chatty precursor quest-givers, revealed creator species, or obligatory robot-versus-fungus war.

## What exists, and what would actually be new

**Already exists in inspected source:** one interactive planetary site, The Anvil; planar annular attraction, scoop-path harvest, heat/reentry, emergency escape; a hauling witness; Tethys institutions; named lane contacts; world-site/traffic/contact-memory seams. The Chord encounter already sets seven helium-3 pods on a curved sling path with a skiff and two raiders. Do not count that as a new expansion encounter or rewrite it merely to attach a new title.

**New proposed content:** a normal skimmer work cycle that creates/loads finite cargo; new visible hull and cold-service hardware; recoverable heavy machinery with authored geometry; a local cast with persistent outcomes; theft/interception organized around that machinery; tangible repair/expansion of the berth; one bounded industrial-weapon distinctiveness prototype, retained only under the explicit criterion below.

**Source-verified integration gaps:** Anvil harvest currently operates on the player only. The sling witness is a passive `ship_mule` at radius 1200/speed 70, with no job/world-record/cargo in its spawn specification. Converting this witness to a named working skimmer is a useful first implementation, preserving its physical curve demonstration, but requires real NPC harvest/loading and cargo ownership. Runtime heat tracks the player plus nearest seven band ships; heat/stage are transient on load. Do not promise unlimited hot workers or persistent individual thermal state without changing those contracts.

**Other unproven requirements:** movable-rack support; physical berth attachment/transfer; persistence for its owned outcomes; power/equipment admission. A catalog entry or saved flag does not establish those behaviors. A separate live-runtime audit confirms persistent physical traffic towing already exists; the occupational-table comment describing a draft limitation is stale. Reuse that backend. The particular wide rack, attachment points and receiver still need their own composed fixture.

**Planet limit:** Stormshift itself adds no second physics planet, spherical surface, landing, vertical flight, atmospheric free-roam, or simulated planetary weather. Visual storm motion does not secretly change the authored planar fields. Other named planet-state assignments are not evidence that they share Anvil's physics.

## The district, not a quest room

Three linked places use the existing Anvil geometry:
1. **Cold berth:** a quiet working refuge outside the dangerous harvest bands, placed only after actual sector extents, influence and neighboring sites are checked. An open work cradle faces the hauling approach. The player can observe unloading and repairs without combat.
2. **Working arc:** collector ships travel a leg through the existing shallow/rich harvest bands, then return toward the berth. Their heat, cargo and turn choices are real enough to interrupt.
3. **Recovery approach:** open maneuvering water, figuratively, for a broad machinery tow and its alternative intercept paths. No mandatory tiny gate puzzle and no trench that requires new terrain.

Do not cover the whole annulus with clutter. Space, anticipation and a clear horizon make the large bodies impressive. Put interesting things where an ordinary route passes them, and preserve a safe entrance and an obvious outward escape.

## Signature asset family: collector, rack, cradle

**Collector skimmer:** a low, broad central hull with two large forward collector cheeks and aft radiator fans. It opens to work and folds to travel. Its load is visible in a small number of replaceable canister positions. Engine placement and scorch wear show how it survives the hot pass. Not a Mule with yellow paint. Art can share the existing Forge surface language; exact ship anatomy must be new and readable from the gameplay camera.

**Mobile cooling rack:** an asymmetric spine with broad folded panels on one side, a clear handling yoke, and a finite set of canister saddles. One heavy body; panels are articulated presentation unless there is a demonstrated need for independent physics. A damaged version retains recognizable missing/bent parts. Its physical handling is the toy: off-center tow, swing clearance, momentum on approach, choice of safe release. Do not fake weight by slowing the player independently of the body law.

**Cold-service cradle:** two static receiving arms with an honest opening and a rack-size void. The rack occupies that void when installed, instead of vanishing into an interaction menu. A repaired second arm or installed panel produces an unmistakable before/after silhouette. Receivers demonstrate approach through working NPCs; no floating rule sticker is the primary teaching device.

**Supporting pieces:** pressure canisters using existing cargo bodies where appropriate; bent panel and detached yoke variants; service hoses/clamps and one small repair drone if the current machinery kit genuinely lacks it. Avoid building ten near-identical worker hulls before the first three forms work.

## Free play first: what I can do here without taking a job

The district should survive this test: **remove the missions and payment prompts; is it still fun to fly through for five minutes?** If the answer is no, do not add more job scripting.

- **Cut a beautiful fast line:** use the existing Anvil sling and a generously open berth approach to link a curved high-speed pass, a close machinery flyby and a clean outward escape. This is the planar equivalent of finding a great GTA jump: readable terrain invites an optional stunt. No score gate, checkpoint rings, artificial speed pad or scripted launch. The player can repeat it just because it feels good.
- **Bowl the empties:** a small physically justified set of empty rejected canisters sits in an open scrap catch area, apart from fuel stock and workers. Ram one, shoot it with a shove weapon, or sling it into another. They use ordinary accepted impact/force rules. Their visible dents, open ends and empty handling position distinguish them from valuable loaded freight. No magical zero-consequence designation: smashing owned equipment can still cause honest damage or anger, while scrap remains an inviting low-risk toy.
- **Make the rack a moving wall:** the loose cooling rack can shield the player from a line of fire, be pushed across an approach, or hit an enemy along its broad face. Cover comes from its real collider and projectile rules, never an aura. Its shape creates useful broad-face versus edge-on choices even before it can be installed. A broken panel must not silently turn into a new live projectile unless it is actually authored as a separable body.
- **Turn a chase into an overshoot:** pass close to the cradle's open arms, brake or turn into clear space, and let a committed attacker contend with the same solids. The arms are real fixed structure, not a special enemy-kill trigger. Miss the turn and the player can hit them too. Keep openings broad enough for ordinary controlled flight and camera visibility.
- **Cause a memorable nuisance:** redirect an empty canister into a tug's path; the tug slows or gives room because of an obstruction. Send valuable cargo off course and a worker goes to recover it. These are visible work changes with consequences, not a toast announcing a prank bonus.

These opportunities begin with normal steering, boost, braking and the player's existing gun. Existing target powers enrich the playground; Massline is an optional expressive build. No activity requires equipping a new tool merely to enter the expansion. Existing harvesting remains available through its current collector control; future specialist fits may enrich it without removing baseline access. The outer sling, scraps, fighting and sightseeing remain immediately playable.

### Chosen new theft behavior, with a bounded hull decision

**Clamp-raider**: a low industrial theft craft built around a pair of oversized lateral gripping jaws, with propulsion offset around its stolen load. Visually it is open when searching, asymmetric and ponderous while loaded, then narrow and quick after releasing. It uses the existing physical towing/attachment backend, not a private movement script.

Its distinctive decision is **keep the prize or regain maneuverability**. While towing, it commits to a broad exit arc and uses the rack as obstructing mass; under pressure it may release the load and become a faster threat. The player can take the released valuable body, pursue the now-free raider, or use the body's continuing motion against the escort. Do not spawn new loot on release: it is the same attached body.

A gun-focused player can break its attack with damage, force it to abandon the prize and fight the escort. A target-power user can spoil its exit vector or manipulate the detached body. A rope build can steal its geometry. Killing every ship is not the single completion condition.

Commit the load/hold/release theft behavior and its readable state transitions. Commission the clamp-raider body when exposed gripping geometry is necessary to explain those states; otherwise use the suitable existing industrial pirate hull with an authored load/handling configuration. This is a model-production choice resolved during the first theft packet, not permission to drop the distinct moving-prize fight. Do not commission a hull whose only distinction is a label.

### Gameplay-camera visual briefs

- **Collector:** broad blunt twin intake cheeks enclosing a dark negative-space mouth; rear fan radiators; compressed central cabin; hot orange working edges against worn cool-painted plates. Open/closed silhouette must read before tiny hoses do. Scorch marks follow the planet-facing equipment, not random grunge.
- **Rack:** one long dark spine, three broad radiator leaves folded asymmetrically, two oversized visible handling points and recognizable canister saddles. Cool pale panels pick up light; damaged leaves are visibly bent or absent. Its silhouette stays obvious both broadside and edge-on.
- **Cradle:** two chunky fixed arms with an unmistakable rack-size gap, blunt protective corners, service hardware tucked out of the flight opening. Warm work lights reveal depth and contact surfaces. No roof over the player; no bloom cloud concealing the passage.
- **Clamp-raider, if admitted:** mechanical jaws dominate the silhouette; cabin sits off-axis; exposed handling hardware and a paired engine arrangement show how it can drag a load. Its threat is visible grip and trajectory, not spikes or red recoloring of the collector.

Asset dimensions, sockets and moving parts must be authored against actual camera and collision constraints. These are concept briefs, not published models.

## Recurring people

Propose three local roles; give names only after checking the canonical cast, and commission portraits once tone is chosen:
- **Shift pilot:** wants to finish the load with their hull intact. Takes a visibly shallower pass after damage, works again after repair, and remembers who recovered their rack or stole their cargo.
- **Berth mechanic:** wants usable hardware more than impressive kill counts. Their work appears as panels, fittings and a second working position on the cradle. The relationship changes access to work or their response to damage; conversation is never a gate to flying, fighting or experimenting. Can provide the industrial acquisition beat after the prototype keep/cut decision.
- **Route buyer:** wants gas delivered predictably and uses the established Tethys trade/customs institutions. Pays for the actual delivered load; a shortage changes the next job or available supply within the existing economy.

An established Tethys courier such as Kess of the Span can cross the district as a familiar face, but do not rewrite their existing identity into its foreman or count their existing Tethys-to-Customs service as new content. Do not move major alien-story characters into this early pocket for convenient exposition.

## The first visit, minute by minute

Timing is pacing intent, not a mandatory script.
- **First minute:** arrive beside a skimmer coming off the bright limb. Ahead, a broad open cradle frames the planet, a spent empty canister drifts clear, and the outer sling offers a fast curved approach. The player can immediately boost through the opening, glance the loose canister into the empty catch area, or ride the curve past the skimmer. Nothing is locked behind a job, dialogue, purchase or Massline fitting. The berth receives a real load while this happens.
- **Next few minutes:** race your own line around the planet, investigate the machinery, join the next working pass or take a paid trial load. The familiar planet law becomes occupational skill. The player chooses when to turn out; nothing requires reading a rule panel to discover that deeper is hotter.
- **Next five to ten:** notice one cold berth position is empty and a damaged rack is waiting off the working approach. Its broad sides make it a moving bank, shield and object to ram or blast, even if you never accept recovery work. Recover it, salvage it, ignore it, or exploit the traffic its absence has diverted. This introduces a genuinely different body and maneuver.
- **Later or on return:** the district's current condition determines the next opportunity. A valuable machinery transfer attracts a theft attempt, a repaired berth runs another skimmer, or uncollected damaged equipment becomes contested salvage. The authored story can be discovered out of order.

Quiet is part of the sequence. No mandatory disaster every time the player enters.

## Three connected activities

### A. Work the hot pass
**Goal:** return with a useful load and an intact ship. This extends existing harvesting into visible local work rather than inventing a new gather meter.

**Distinct decisions:** entry tangent and speed; shallow sustainable path versus brief rich pass; turn-out before accumulated heat consumes the return margin; leave room for another worker. The player's piloting is the action. No hover-to-fill loop, ring checkpoint course, hidden time bonus, or hard-coded “correct” route.

**Physical combinations:** use existing Massline/field/impulse capabilities where their actual body contracts permit them; observe a working ship's line; risk cargo mass affecting the return. Do not make a decorative tow pretend to influence handling.

**Aftermath:** delivered commodity becomes finite stock/traffic through the economic owner. A failed pass can leave a damaged worker, recoverable cargo or a repair bill, but should not automatically manufacture all three. Later work depends on what actually survived.

### B. Bring back the cold rack
**Goal:** return a broad, damaged piece of cooling hardware to the empty cradle.

**Distinct decisions:** tow it end-on or accept a wider swing; approach slowly under load or carry momentum and make an earlier braking arc; release and reacquire if its attitude is wrong; save attached valuable canisters or jettison them to reduce the burden. The receiver accepts a plausible position/relative motion/attitude envelope, not a microscopic alignment test.

**Physical combinations:** use an existing directional impulse to trim the loose rack, a well to gather separated contents, or deliberate ship motion to rotate the tow. Gun-only players can clear threats and damaged obstruction from the recovery approach while a real working tug handles the attached rack; that tug must perform the move, not teleport on combat completion. Handlers can take over and solve the physical move directly. Neither a purchased rope nor precise towing is a compulsory opening task. Only honor accepted forces. A fixed berth never becomes movable merely because this is a physics expansion.

**Aftermath:** installed rack stays visible and enables a second real service position. A damaged-but-usable rack gives reduced service until repaired; lost canisters remain salvage if they survived. Selling the rack can fund the player but leave the berth short of capacity. This is one authored finite recovery, not a rack that mysteriously breaks anew every visit.

### C. Stop the hardware theft
**Goal:** a hostile crew is leaving with an intact rack/load needed by the district. Recover the valuable body or choose to let it go. The moving objective matters more than clearing all enemies.

**Distinct decisions:** cut the straight intercept across the sling instead of following the target; separate the escort from the laden thief; use knockback or Massline to spoil the escape vector; shoot the hauling assembly only if an actual separable implementation exists, otherwise disable the ship through existing combat; preserve the cargo amid powerful area attacks.

**Composition:** one loaded escape craft plus one lighter disruptor, consistent with the location's actual encounter budget. Reuse capable existing doctrines rather than claim a new AI system. Their different masses and goals must change useful responses. They should not both park and trade HP.

**Aftermath:** recovered hardware restores service; a disabled surviving thief can flee or leave salvage under existing systems; destroyed machinery leaves a real shortage and a replacement job; an escaped theft leaves the berth affected. Do not promise a galaxy-wide recurring named nemesis unless its identity is genuinely persisted. No forced reload.

**Relation to The Chord:** preserve that existing gas-pod event as an occasional neighboring incident. It shows the district's working material escaping into the sling and gains context from the new ordinary life. It is not activity C under a new name. Its current payout is based on raider defeat and surviving pod count, not delivered recovery: never present that as proof of a material transfer economy. Keep the location's existing encounter density; no permanent pirate camp is implied by this proposal.

## Progression and build motivation

Three viable fits, not classes or a new skill tree:
- **Runner:** efficient collectors/cargo and thermal margin; wins through route judgment and quick returns, with less room for weapons or manipulation equipment.
- **Handler:** stronger existing Massline/impulse/field choices and maneuvering control; moves awkward machines and recovers valuable objectives, with reduced cargo or damage output according to current slot rules.
- **Breaker:** forceful gun plus selected target powers; removes escorts quickly but must manage collateral when the prize is physical hardware.

Use the existing fitting/progression system and real slot, heat, mass, energy and cargo tradeoffs where implemented. No separate district talent tree, reputation currency, or permanent blanket stat bonus. The payoff is “now I can recover that whole rack,” “now I can afford the deeper pass,” or “now I can open an intercept window.”

**Bounded candidate: prototype the canister driver, then retain or cut it.** A visibly repurposed industrial pressure launcher that fires a heavy, directional impulse projectile. Its personality is huge launch recoil, a readable traveling body and a violent shove; it competes with a precise conventional gun because the valuable target can be knocked somewhere undesirable. Final behavior must be chosen with the combat owner: reuse the accepted ordnance/impulse path, bound projectile counts, do not promise a new arbitrary rigid-body projectile simulation. Its progression value would have to be a new spatial option, not merely higher DPS. **Distinctness falsifier:** if the actual choices reduce to the existing concussion cannon/impulse ordnance with a different mesh, damage number or cooldown, cut this weapon from the expansion. The only promising distinction to prototype is a recoverable heavy canister whose continuing path can be redirected or used as cover after launch, creating a choice between firing the body away and keeping it in play. That requires genuine shared body behavior and must earn its complexity. The expansion commits to resolving this prototype once, before a production weapon commission. Retain it only if the same finite canister remains physically useful after firing and both a new tactical choice and acceptable cost are demonstrated. Otherwise record the falsifier, cut the gun, and put the industrial acquisition beat onto an existing excellent concussion weapon with district art/context. A failed distinctiveness test must not leave a placeholder weapon in the catalog. Judge this optional combat toy through design review against the existing weapon roster; do not add a routine user-approval gate.

**Tab-target powers remain welcome:** target selection makes a hectic field manageable; the selected body's location, mass, motion and surrounding allies still determine what a power accomplishes. A targeted shove can ruin a theft or destroy the wanted rack. A well can gather salvage or pull it across a bad line. No immunity labels devised solely to force the authored answer.

**Longer-term return:** the repaired berth visibly supports work; one later investment can add a working arm or storage saddle and create an additional delivery leg. Keep this as a bounded first case of player authorship, not immediate universal station construction.

## Chained play and durable payoff

The district's finishing pass must demonstrate this unscripted chain: a loaded thief commits to a broad turn; the player crosses the sling to intercept; pressure makes the thief keep or release the rack; the moving rack can shield a retreat, obstruct the escort or remain the recoverable objective; returning the **same** rack restores visible work. This is a reference play story, not a mandatory solution. Also prove the quieter story: a careful pilot simply recovers the rack without killing anyone and later sees a worker use it.

Use a bounded state contract through existing owners: rack available/damaged → under custody/tow → released/in transit → received or lost; installed rack condition determines a usable berth slot. Heat, cargo, survival and witness facts belong to their existing authorities. Reload in each meaningful transition must neither reset the body nor complete its job twice. Removal after installation must visibly remove capacity if that removal is supported; otherwise the authored attachment must honestly become a fixed installed structure with the conversion recorded once.

The first berth upgrade consumes one finite admitted repair/fabrication lot, installs a visible arm or saddle and schedules an additional physical leg. The mechanic acknowledges the actual outcome. It creates a useful service/recovery foothold through existing station access, not free global repair, invented menu perks or unbounded profit. Theft/loss can be repaired with ordinary replacement stock so the first mistake does not dead-end the district.

### Finish every model and every participating system

Review the collector first, then the rack, then cradle/upgrade, canisters and any admitted raider configuration. For each, inspect the real route at normal and close gameplay cameras: silhouette, scale, materials/light, active/damaged outline, moving joints, sockets and collider gaps. Tune out a model's specific readability or performance defect before moving to the next. Save an honest before/after record with the existing graphics tools; an export succeeding is not a visual pass.

Review harvest/loading, towing/receipt, theft/escort AI, repair/economy, save/Continue and render/effects separately, then together in the authored busiest scene. Compare quiet normal work, rack recovery and fight-plus-collateral using repeatable existing probes. Measure frame pacing and body/effect/draw costs on the stated device/settings; repair the observed cause without deleting the defining physical body or flattening default art quality. Check near/far transitions preserve identity and yield the same commodity totals. Use the existing owner contracts and acceptance tools instead of adding a district-specific engine or benchmark framework.

## Honest consequences without punishment chores

Persist a small set of facts: rack location/condition; working berth capacity; actual delivered/lost cargo outcomes; relevant worker survival/damage/memory. Derive current jobs from those facts through existing owners. Avoid a new parallel district simulation framework.

Consequences should create another interesting option, not a permanent dead save. Replacement parts and repair work offer recovery. Leaving the district alone yields ordinary local work, not an offscreen catastrophe engineered to guilt the player. No infinite passive-money faucet, and no magically respawned named NPC presented as the same person after death.

## Staged production, each ending in playable new content

1. **Working Anvil:** collector hull + cold berth art, one visible genuine load cycle, ordinary reachable entry. Deliver a new place and occupation before any crisis.
2. **Rack recovery:** mobile rack, receiver behavior, complete activity B, saved installed/lost/damaged outcome. This is the expansion's first unequivocally new physical toy.
3. **Fight over something useful:** activity C composed with existing combat/powers; collateral, escape and recovery outcomes; preserve the existing Chord.
4. **Personal return:** recurring-worker reactions, one installed second working arm/storage saddle and its additional delivery leg; resolve the canister-driver prototype by the stated keep/cut criterion. An art-only upgrade or passive-income counter does not satisfy the berth improvement.

Use current place registration, Forge, world-site operations, traffic/jobs, physics authority, economy and contact memory. Coordinate exact owners; don't fork them. Nearby work is real; distant workers may be cheap coherent job-state simulation. No lowering default visual quality to pay for crowd count.

## What the finished district must prove

- Without mission labels, a player can tell what one skimmer is doing and why the berth is shaped that way.
- Its three activities demand different physical decisions: trajectory/heat, mass/clearance, interception/collateral.
- The same rack is seen in work, recovery, conflict and aftermath. Cargo is not duplicated at handover.
- A normal arrival exposes the content; no debug teleport or rare encounter roll is its only entrance.
- Leaving and returning preserves one meaningful physical consequence and one relevant human response.
- A standard flying/combat approach and an alternative manipulation approach both work, without a scripted success trigger replacing the physics.
- The new hull, rack and cradle remain recognizable at gameplay camera distance and do not hide the player.
- Frame pacing and entity admission remain within existing targets on the actual route. Do not certify delight from counters; report functional proof separately from visual judgment.

## Design direction and review decisions

The owner broadly approves strong ideas within the established vision and does not want routine detail choices to interrupt progress. Therefore use the working hot-industrial direction, the large recoverable cooling rack, and specific cast/art design as ordinary design decisions. Develop names, paint, dimensions and behaviors consistently with canon; do not send each for taste approval.

The proposed weapon must pass distinctiveness review against existing concussion/impulse tools. That is a designer's responsibility, not a question the owner must resolve. Revise or cut redundant mechanics while preserving the larger commitment to substantial new authored content.

Escalate only a genuinely consequential departure from the owner vision, an unresolved canon contradiction, or a material project-scope choice. The owner has now requested complete development after publication of the reviewed plan PR. Execute it through the existing runtime/asset owners in small verified commits; this text does not supersede repository coordination or authorize unrelated releases, account changes, spending or new legal agreements.

## Key sources

- [Owner vision](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/VISION.md)
- [Anvil physical site](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/planets.js)
- [Authored places and existing alien sites](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/authoredPlaces.js)
- [Sector way of life](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/sectorWayOfLife.js)
- [Existing Chord encounter](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/encounters/351-the-chord.js)
- [Occupational craft (tug comment is stale; inspect live traffic owner)](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/src/data/occupationalTrafficCraft.js)
- [Alien-ecology canon and progression](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/alien-ecology-program/README.md)
- [Machine-family design](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/alien-ecology-program/07_PRECURSOR_MACHINE_LAYER.md)
- [Alien rewards](https://github.com/coldshalamov/SpaceFace/blob/c488ecc10c23ad613dc35c61c04f124a3b77723a/design/alien-ecology-program/06_UNLOCKS_REWARDS_AND_ECONOMY.md)

## Integration details

See [Anvil integration](ANVIL_INTEGRATION.md) for canonical IDs, current band geometry, ownership and the first complete working-shift slice. The game-wide target and asset program, not this district alone, determine subsequent content.
