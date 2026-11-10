<!-- LIFETIME: ACTIVE_PROGRAM -->
# CHAOS idea bank — front-loaded INFERENCE units

Read [`README.md`](./README.md) first. Each unit is an INFERENCE line, already thought through so
an agent's job is to **build it well**, not invent it. Format per unit:

- **Player promise** — what the player feels, in their words.
- **Build** — the concrete mechanics.
- **Reuse** — existing owners to extend (find them; never write a parallel system).
- **Done** — the player-visible check (capture on the ordinary route + one independent review).
- **Goes wrong if** — the predictable bad version.

Pick units in group order unless a lane prompt says otherwise. A unit is one complete production
commit (or a short series), not a plan. If a unit turns out to exist already, verify it on the
route, **deepen** it to the promise, and record that.

---

## A. Weight and wreckage — ramming, breaking, piling up

**CH-01 Juggernaut handling.** *"I'm flying a tank. Nothing stops me."*
Build: heavy hulls (Ironback, Atlas, Colossus, Leviathan) get a ram identity: a reinforced prow
that turns frontal collisions into damage for the other body, momentum that barely bleeds on
impact, a slow heavy turn with a satisfying commitment, a deep engine note and a weighty camera
(more lag, bigger rumble on impact). Reuse: ship defs, flight model profiles, `HEAVY_AS_TERRAIN_MASS`,
crumple law, feel/camera owners. Done: a capture plowing through a docking queue where light ships
crumple and scatter while the hull barely slows. Goes wrong if: the heavy ship is just slow and
boring, or ramming damages the player as much as the target.

**CH-02 Ram damage for everyone.** *"Hitting things hard hurts them, and how much depends on how
big we are."*
Build: craft-on-craft impacts deal damage by closing speed and mass ratio (the terrain crumple law
already does this for rocks; extend to craft with the mass ratio), so a light ship rammed by a heavy
one is wrecked, two equals both crumple, a light ramming a heavy bounces off hurt. Reuse:
`src/combat/impulseKernel.js` crumple and consequence laws. Done: fixtures for the three cases +
captures. Goes wrong if: every bump is lethal (traffic grinding is not chaos), or damage ignores mass.

**CH-03 Breakable stations.** *"I can wreck parts of a station, and it matters."*
Build: station outer modules — antennae, solar wings, cargo racks, fuel tanks, docking arms,
lights — are physical breakable parts with health. Breaking one has a gameplay consequence: a fuel
tank explodes (CH-04), a cargo rack spills crates, a docking arm going down jams traffic, the solar
wing drifts as debris, the station's lights flicker on the damaged side. Damage persists (CH-65).
Reuse: station prop/module data, physical body spawner, volatile cargo, traffic docking queue.
Done: capture of each module breaking and its consequence. Goes wrong if: parts break but nothing
changes, or the whole station explodes (it shouldn't — stations are tough, parts aren't).

**CH-04 Chain reactions.** *"I hit a fuel hauler and the whole lane went up."*
Build: volatile cargo and fuel tanks detonate on hard hits or fire, the blast shoves and damages
nearby bodies, and other volatiles in range can chain. Fuel haulers visibly carry hazard markings so
the player can choose to use them. Reuse: `commodityVolatileClasses.js`, impulse charges/blast
owner, cargo pods. Done: a staged and an unstaged chain captured; chains always have a visible
cause. Goes wrong if: chains are random or invisible, or every crate explodes.

**CH-05 Wreckage that stays and matters.** *"The mess I made is still there, and people have to deal
with it."*
Build: wrecks and big debris persist for minutes as real obstacles; traffic routes around them and
sometimes doesn't (pile-ups); tugs and salvagers come to clear them (a job you can steal). Reuse:
aftermath wrecks, salvage, traffic recovery ops. Done: capture of traffic diverting, a pile-up, and
a salvage tug arriving. Goes wrong if: wrecks vanish quietly, or they clog the lane forever.

**CH-06 Rocks that break.** *"I smashed a big rock into pieces and used the pieces."*
Build: large asteroids fracture into 3–6 smaller physical pieces on a heavy impact or bomb; the
pieces are throwable with the Line. Reuse: asteroid field, fragment families, Line target scoring.
Done: capture. Goes wrong if: fracture is a particle effect with no bodies.

**CH-07 Domino docking queues.** *"I bumped the first ship in line and the whole queue went over
like dominoes."*
Build: station docking queues are tightly packed waiting ships with real bodies; a hard shove
cascades. Reuse: traffic docking ops, CH-02. Done: capture. Goes wrong if: queue ships are kinematic.

## B. The world reacts

**CH-10 The reaction matrix.** *"Everyone reacts to me."* — the meta-unit. Build the matrix in
README §3, cell by cell, through the units below. Status table `chaos/MATRIX_STATUS.md`.

**CH-11 Panic that spreads.** *"When things go bad, everyone scatters."*
Build: civilians enter a flee state from nearby violence, explosions or a high-heat player; panic
spreads by proximity (a fleeing ship spooks its neighbours); fleeing ships pick escape headings,
bunch at gates, collide with each other under panic (pile-ups!). Reuse: traffic role ops, law
incident events, fields as escape obstacles. Done: capture of a panic wave crossing a busy lane.
Goes wrong if: everyone flees in the same direction in a neat line, or panic never ends.

**CH-12 Horns and near-misses.** *"Fly too close and they lean on the horn."*
Build: a near-miss at speed triggers a horn (distinct horn per ship class), a swerve, and sometimes a
one-line bark; repeated near-misses escalate (CH-13). Reuse: traffic, bark director, audio recipes.
Done: matrix column "flies past fast" filled for every civilian row. Goes wrong if: horns spam, or
the bark is lore.

**CH-13 Road rage.** *"I clipped a guy and now he's chasing me."*
Build: some personalities (CH-61) follow and harass after being hit: tailgate, ram back, shoot if
armed, give up after a while or if you outrun them; a cocky one might challenge you to a race.
Reuse: tactical AI pursuit, personality, heat. Done: captures for three personalities. Goes wrong
if: every civilian becomes a killer.

**CH-14 Vultures.** *"Spill cargo and scavengers show up in seconds."*
Build: spilled cargo and fresh wrecks broadcast an opportunity; scavengers and pirates within range
converge, fight each other over it, and you can fight them or race them. Reuse: freight cargo spill
listener (exists), salvage, pirate doctrine. Done: capture. Goes wrong if: they teleport in.

**CH-15 Have-a-go heroes.** *"I attacked a hauler and a militia pilot came to stop me."*
Build: armed civilians/militia sometimes intervene when you attack someone nearby, scaled by
faction and sector. Reuse: law, faction conduct, tactical AI. Done: capture. Goes wrong if: it
happens every time.

**CH-16 Visible witnesses.** *"Someone saw me, and if I catch them before they reach the cops, it
didn't happen."*
Build: a witness of a crime flies toward the nearest patrol or station with a visible marker; if
they arrive, heat rises; if you stop them (block, tow, scare off), it doesn't. Reuse: law witnesses,
lawSecurity jurisdiction. Done: both outcomes captured. Goes wrong if: the witness is invisible or
instant.

**CH-17 Light the fuse on a turf war.** *"I dragged a pirate into the patrol zone and they went to
war with each other."*
Build: factions hostile to each other fight when brought together; luring, towing or throwing one
into the other's space starts a skirmish that grows if unattended. Reuse: factions, conflict zones,
conflict reactions, tactical AI. Done: capture of a player-caused skirmish. Goes wrong if:
factions ignore each other's provocations.

**CH-18 Station reacts.** *"The station knows what I did."*
Build: station traffic control closes the docking lane, turrets track you at heat, the station PA
calls the event, docking is refused or taxed, hangar crews are nervous. Reuse: station shell, dock
deny, law. Done: capture across heat levels. Goes wrong if: it's only a text toast.

## C. Heat and chases

**CH-20 The heat ladder, everywhere.** *"The more I do, the harder they come."*
Build: 1–5 heat in every lawful sector: 1 a cutter investigates; 2 two cutters + interdiction
mines on your route; 3 an interceptor wing; 4 a gunship + gate blockades; 5 a capital ship + named
bounty hunters. Each step has a visible arrival (they come from somewhere), a sound, and a heat-star
change on the HUD. Reuse: `heat.js`, `lawSecurity.js`, patrol spawning, bounty hunters, Nemesis.
Done: a capture climbing 1→5. Goes wrong if: heat is a number with no new behaviour per level, or
units spawn on top of you.

**CH-21 Losing the heat.** *"I broke line of sight in the asteroid field and they lost me."*
Build: pursuers have search cones shown on the radar (GTA's minimap cones); break line of sight and
stay unseen to cool down; hiding in rock fields, nebulae and wreck fields helps; swapping ship
(hijack) or a fence's transponder spoof clears it. Reuse: perception, radar, shipjack, fence.
Done: three escape methods captured. Goes wrong if: heat just decays on a timer.

**CH-22 Police with physics.** *"They tried to tow me in and box me against a station."*
Build: patrol tactics use the game's verbs: tether you and tow, box you in with ships, ram to
spin you out (PIT), drop mines across lanes, set blockades you can smash through with a heavy
ship (CH-01). Reuse: tether, tactical AI, mines, formation logic. Done: each tactic captured with
a counter. Goes wrong if: police only shoot.

**CH-23 Getting caught isn't game over.** *"They caught me — now I have to pay or break out."*
Build: disabled at high heat → towed to custody (exists) → choose: pay the fine, lose the cargo, or
break out (a short escape). Reuse: custody chain, court cases. Done: all three paths. Goes wrong if:
it's a reload.

**CH-24 Hunters with names.** *"That same bounty hunter is back, and he's learned."*
Build: bounty hunters at heat 4–5 are named, recurring, and adapt (Nemesis). Reuse: Nemesis learner,
bounty hunters. Done: capture of a returning hunter using a counter to your last tactic.

## D. Vehicles and hijacking

**CH-30 Hijack anything, anytime.** *"I roped a freighter, ripped the pilot pod off and flew it
away."*
Build: a casual hijack verb on any ship below a class limit: latch → yank the pilot pod (it ejects
as a lifepod) → your ship parks and is recoverable → you fly the stolen ship with its handling and
cargo; owners report it (heat). Reuse: `shipjack.js`, survivor pods, Line. Done: hijack captured on
three classes. Goes wrong if: it's a menu, or a 30-second minigame.

**CH-31 Ships with one signature verb each.** *"Every ship I take does something different."*
Build: each hull class gets one standout verb tied to the chaos: tug = tow anything heavy, barge =
ram, racer = boost-drift, gunship = broadside, freighter = cargo container train, saucer = gravity
lift. Reuse: ship defs, existing modules. Done: a lineup capture of each verb. Goes wrong if:
ships only differ by stats.

**CH-32 Cargo trains.** *"Freighters drag strings of containers, and I can cut the line and steal
them."*
Build: freighters tow container strings on lines; cutting a line (shot, Line, ram) spills the
containers as physical bodies; you can tow them away. Reuse: tether/attachment physics, cargo pods,
convoy ops. Done: capture. Goes wrong if: containers are cosmetic.

**CH-33 Call your ship.** *"I whistled and my ship flew over to me."*
Build: from the radial, call your owned ship to your position (autopilot), useful after a hijack.
Reuse: fleet/wingman orders, autopilot. Done: capture.

## E. Things to do — sandbox play

**CH-40 Situations, not scripts.** *"The mission gave me a goal and let me do it my way."*
Build: missions present a goal, the parties, the physical setup and the stakes; every method that
achieves the goal counts; failure mutates the situation (VISION). Convert the top encounters
(master plan W2) to this shape. Reuse: encounters, missions, story ledger. Done: one mission
completed three different ways, captured. Goes wrong if: "use the Line to…" instructions force one
solution.

**CH-41 Activities with physics.** *"There's always something fun to do on the way."*
Build: repeatable GTA-style activities, each built around a physics verb: demolition contracts
(clear a derelict field into a crusher), repo jobs (tow a ship out of a station), passenger runs
where the passenger reacts to your flying, races through live traffic, vigilante bounties, salvage
rush after a big wreck. Reuse: contracts, race system, traffic, salvage. Done: each activity
playable from the map with a capture. Goes wrong if: activities are fetch quests with a timer.

**CH-42 Things happening on the road.** *"I keep running into stuff happening."*
Build: a chaos director (extend the encounter director) keeps 1–2 small live events near the player
in busy space: a breakdown, a robbery in progress, a chase passing through, a convoy ambush, a
drunk pilot weaving, a pile-up. Variety rules so 20 in a row don't repeat. Reuse: encounter director,
microevents, traffic. Done: life count (README §3) met in 3 sectors. Goes wrong if: events stack on
the player constantly, or they're the same template.

**CH-43 Chaos pays.** *"Making a mess got me something."*
Build: chaos has economic upside and costs: salvage, stolen cargo, bounties, fence sales; repair
bills, fines, insurance; notoriety (CH-44). Reuse: economy, fence, custody. Done: a 10-minute
rampage session ends with a readable ledger of gains and costs. Goes wrong if: chaos is pure loss
or pure gain.

**CH-44 Notoriety.** *"People know who I am now."*
Build: an outlaw ↔ hero reputation separate from faction standing: changes who hails you, prices,
which activities open, how patrols treat you on sight. Reuse: faction reputation, law history.
Done: two saves with opposite reputations behave visibly differently. Goes wrong if: it's a number
on a screen only.

## F. Player feel and UX

**CH-50 A camera for chaos.** *"I can see the mess I'm making."*
Build: the camera pulls back with speed and with nearby chaos (more bodies moving = wider), frames
big impacts briefly, and is heavier for heavy hulls. Reuse: camera director. Done: before/after
capture of a pile-up. Goes wrong if: the ship becomes a speck; motion sickness (respect reduced
motion).

**CH-51 Context prompts at the target.** *"It tells me what I can do right where it is."*
Build: small prompts on the target in the world ("R hijack", "F grab", "hold E tow"), only when
possible, never a list. Reuse: interaction owners, bindings. Done: capture. Goes wrong if: prompts
spam on every object.

**CH-52 A map that shows opportunity.** *"I open the map and see where the fun is."*
Build: map layers for heat, juicy cargo, active events, activities, faction turf; one click sets a
waypoint; an in-flight route line (GTA's GPS). Reuse: chart/galaxy map, local map. Done: ui-bench +
live capture. Goes wrong if: the map becomes a spreadsheet.

**CH-53 Fail fast.** *"When I die I'm back in seconds."*
Build: death → 3–5 s beat → respawn at the nearest station with a clear cost; mission retry from
the last checkpoint; no long reload. Reuse: insurance respawn, game over. Done: timed death→control
≤ 8 s. Goes wrong if: the beat is skippable-only by a menu.

**CH-54 One radial for everything quick.** *"Quick actions without menus."*
Build: one radial (hold a key/button) for call ship, set waypoint to last event, accept the offered
job, hail, wingman orders. Reuse: comms radial, wingman radial (exist). Done: ui-bench walk. Goes
wrong if: it grows to 12 slots.

**CH-55 Status at a glance.** *"I always know my heat, my cash and my hull."*
Build: flight HUD in Adventure shows heat stars, hull/shield, cash change pops, cargo count,
objective — nothing else persistent (pairs with master plan X3). Done: screenshot judged against the
SWARM taste bar's budget.

**CH-56 Controls that feel arcade-right.** *"It does what I meant."*
Build: an audit of steering response, dead zones, brake, boost, aim assist and gamepad parity
against what you know of arcade flight references; fix what's wrong through the flight tuning
owners. Done: a written comparison + before/after captures. Goes wrong if: feel is "fixed" by
lowering speed.

## G. Character and detail

**CH-60 The life count.** *"Space feels busy and lived in."* Build the README §3 life count through
CH-42, CH-61, CH-62, CH-63. Done: 20 random 10 s windows per sector, ≥ 4 events each.

**CH-61 Pilots with personality.** *"Every pilot drives differently."*
Build: NPC pilots carry a personality (cautious, aggressive, cocky, panicky, veteran, drunk) that
changes their driving (spacing, speed, braking), their matrix reactions, and their barks. Reuse:
NPC jobs, traffic, tactical doctrine, barks. Done: side-by-side capture of five personalities in the
same lane. Goes wrong if: personality is only a bark.

**CH-62 Barks that fit the moment.** *"They say the right thing at the right time, briefly."*
Build: wire barks to matrix cells (≤ 8 words, in character, with voice where lines exist — 439 voice
files are unused); one voice at a time; never lore over action. Reuse: bark director, bark
situation fill, voice files. Done: matrix bark coverage + a 2-minute recording judged for fit and
spam. Goes wrong if: barks become constant chatter.

**CH-63 Stations as places.** *"Stations are busy places with a routine."*
Build: docking lights and queues, maintenance drones, cargo transfers, shift changes, PA
announcements that react to events (including yours), lights going out where you broke something.
Reuse: station side events, station operation VFX, CH-03. Done: 60 s capture at two stations.

**CH-64 Every ship tells you what it's doing.** *"I can tell a hauler is loaded and a pirate is
hunting."*
Build: readable states on NPCs: loaded haulers sit lower/slower with visible containers; hunting
pirates run dark with red running lights; patrols strobe when pursuing; damaged ships trail smoke
and limp. Reuse: existing state signatures, NPC job signature VFX. Done: lineup capture.

**CH-65 Consequences that persist.** *"The place I wrecked yesterday still shows it."*
Build: station damage, wreck fields, faction territory shifts and patrol density changes persist
across save/continue for a while and visibly heal (repair crews). Reuse: aftermath, save owners.
Done: wreck a station module, save, continue, the damage and the repair crew are there.

## H. Missing pieces to keep in view (decide, don't drift)

- **A chaos director** (CH-42) is the open-world equivalent of Left 4 Dead's director: pacing, not
  just spawning. Without it the world is either empty or overwhelming.
- **Progression from chaos** (CH-43/44 with master plan P3): chaos must feed the pilot.
- **Readable cause** everywhere: in a pile-up, the player should be able to point at what started
  it (VISION: "the world can be messy; the player's understanding cannot be").
