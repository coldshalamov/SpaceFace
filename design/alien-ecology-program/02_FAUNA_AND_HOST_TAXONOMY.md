# 02 — Fauna and Host Taxonomy

## Goal

Create alien life that feels ecological rather than roster-like.

The player should eventually recognize roles in the ecosystem the way a diver recognizes reef life: feeder, grazer, cleaner, ambush predator, carrier, nursery, scavenger, territorial giant. Infection changes those roles but does not erase them.

SpaceFace should favor organisms whose motion and body plans fit the current 2.5D ship/physics engine before investing in a full skeletal-animation stack.

## 1. Host hierarchy

### Class A — microbial and substrate hosts

Function:
- metabolize trace organics;
- condition surfaces;
- begin colonization;
- generate films, mats, cysts, and mineral-binding tissue.

Gameplay:
- environmental dressing;
- scanner clue;
- salvage contamination;
- no targetable combat entity required.

### Class B — simple motile fauna

Examples:
- floaters;
- filter-feeders;
- membrane rays;
- wormlike drifters;
- spore grazers.

Network effect:
- route sharing;
- attraction/avoidance;
- synchronized escape;
- crude target fixation.

Cognition remains low.

### Class C — complex native fauna

Examples:
- large predators;
- migrators;
- nest builders;
- electromagnetic hunters;
- vacuum-adapted megafauna.

Network effect:
- coordinated hunting;
- inherited route memory;
- group defense;
- repeated manipulation of objects learned from prior hosts.

These are the most useful "alien monster" layer because they can be frightening without becoming a political faction.

### Class D — technical hosts

These are biological organisms using or inhabiting machinery:
- colonized maintenance drones;
- reanimated ship systems;
- wrecks whose remaining actuators are driven by fungal tissue;
- living colonies that use a reactor as heat source.

Important: the fungus does not magically understand a ship. It can exploit active systems only when host memory, surviving automation, or repeated selection provides a pathway.

### Class E — sapient infected hosts

The Vethari occupy this class.

Other extinct or unknown sapient hosts may be implied in deep regions, but adding another visible sapient infected civilization should require an explicit canon decision.

## 2. Behavioral grammar

Fauna do not need the full human tactical AI grammar.

Use a compact drive model:

IDLE
-> DRIFT
-> FORAGE
-> INVESTIGATE
-> SHADOW
-> DEFEND
-> SWARM
-> ATTACH
-> FEED
-> FLEE
-> RETURN
-> MIGRATE

Each species gets:
- stimuli;
- preferred distance;
- threat threshold;
- group response;
- relay dependence;
- persistence;
- disengage condition.

Examples:

A heat grazer may investigate engines but flee weapons fire.

A hull leech may shadow a ship until cruise drops, then attach.

A territorial ray may posture near its nursery and never pursue outside the zone.

A carrier may ignore the player entirely unless the player blocks its migration vector.

This is more alien than every creature being team 1.

## 3. Hive-field effects

The field modifies behavior rather than replacing it.

Low coherence:
- nearby animals loosely align headings;
- threat warnings spread;
- route choice becomes correlated.

Medium coherence:
- packs converge on shared stimuli;
- individuals alternate attack/retreat roles;
- sensory coverage improves;
- creatures react to threats outside personal sensor range.

High coherence:
- multiple species coordinate around the same local objective;
- relay organisms can redirect groups;
- host-shadows produce eerily repeated maneuvers;
- pain or panic cascades can destabilize the whole group.

Destroying or leaving range of a relay should reduce coherence, not kill organisms.

## 4. Creature family seeds

### 4.1 Veil Rays

Large translucent membrane organisms that surf electromagnetic gradients.

Normal behavior:
- feed on charged dust and nebular plasma;
- avoid high acceleration.

Infected behavior:
- align around reactor signatures;
- share the location of active scanners;
- occasionally mirror a maneuver learned from ship traffic.

Gameplay:
- not initially hostile;
- become dangerous if panicked into a dense flock;
- useful as a living warning that a high-field region is near.

Engine fit:
- one deforming membrane mesh;
- slow bank/yaw;
- shader ripple;
- no legs.

### 4.2 Lantern Cysts

Buoyant sac-like organisms with luminous internal organs.

Role:
- fungal dispersal carrier.

Behavior:
- drift toward heat;
- rupture under heavy damage;
- release particulate bloom and tiny juvenile forms.

Gameplay:
- environmental hazard and resource;
- shooting them can make an area worse;
- careful towing can move them.

### 4.3 Hull Leeches

Flattened radial organisms adapted to metal-rich wreck fields.

Behavior:
- attach to warm hulls;
- feed on coatings, trapped organics, and electrical gradients;
- detach under specific vibration bands.

Infected form:
- relays weak sensor information to nearby ecology.

Gameplay:
- attachment event;
- temporary heat/energy penalty;
- can be removed with movement, pulse tools, docking service, or targeted maneuver.

### 4.4 Needle Swarms

Small rigid-bodied dart organisms.

Behavior:
- feed on spore clouds;
- flee large masses.

Infected form:
- become a distributed proximity sensor around nests.

Gameplay:
- scanner clutter;
- not worth shooting individually;
- useful visual indicator of hidden colony geometry.

### 4.5 Casket Worms

Segmented organisms living inside wreck cavities.

Behavior:
- remain dormant until vibration;
- emerge through hull breaches.

Infected form:
- route-memory causes them to patrol repeated paths through a wreck field.

Gameplay:
- ambush;
- can be baited by impulse shock or mining vibration.

Engine fit:
- articulated rigid segments;
- procedural curve motion;
- no skeletal skinning required.

### 4.6 Anchor Beasts

Large sessile organisms that grow around asteroids or structural nodes.

Role:
- territory anchor;
- mineral processing;
- possible relay.

Behavior:
- mostly immobile;
- launch tendrils or small defensive organisms;
- withdraw when starved.

Gameplay:
- setpiece;
- can be mined, studied, avoided, or attacked;
- destroying one changes local ecology but may release contamination.

### 4.7 Mourning Kites

Rare solitary-looking organisms that repeatedly follow a fixed route around old wrecks.

Infection:
- host-shadow contains a strong grief/return loop from a prior network event.

Gameplay:
- non-hostile mystery encounter;
- following one can lead to a hidden site;
- its path is a memory, not conscious guidance.

### 4.8 Furnace Maw

Heavy predator attracted to sustained reactor output.

Body:
- layered heat-radiating plates;
- expandable feeding cavity.

Behavior:
- shadows at long range;
- charges when target is heat-saturated.

Gameplay:
- rewards thermal discipline;
- cruise and overheat become ecological signals.

### 4.9 Glassbacks

Armored grazing organisms incorporating silicate/mineral tissue.

Behavior:
- scrape asteroid surfaces;
- reflect some light/energy.

Infected lineage:
- selected in laser-heavy historical zones, but not because of instant adaptation.

Gameplay:
- beam weapons are inefficient;
- kinetic/impulse tools and environmental collisions are better.

### 4.10 Wake Eels

Long organisms that follow gravitational or ion wakes.

Behavior:
- trail ships harmlessly;
- use wake turbulence for locomotion.

Infected form:
- trail can become an information chain leading predators toward traffic.

Gameplay:
- atmospheric omen;
- player can deliberately use one as bait.

### 4.11 Spindle Mothers

Slow reproductive carriers surrounded by juveniles.

Behavior:
- avoid fights;
- choose stable thermal pockets.

Infection:
- very high spore load.

Gameplay:
- moral/ecological choice;
- killing one is easy but contaminates a large area and can alter future encounter tables.

### 4.12 Bristle Rams

Dense armored organisms that solve threats by impact.

Behavior:
- territorial collision;
- no ranged attack.

Gameplay:
- perfect for SpaceFace's physical combat vocabulary;
- massline, impulse charges, terrain, and momentum matter.

### 4.13 Choirless

Tiny organisms that normally remain networked. When isolated from the field they become disoriented and produce repeated electromagnetic calls.

Gameplay:
- clue that the player has entered a "dead pocket" in an otherwise infected region;
- may reveal precursor suppression fields.

Name is placeholder and should not conflict with Ascendant Choir in final naming.

### 4.14 Archive Crabs

Slow radial scavengers that collect fragments into geometric piles.

The behavior looks intelligent but may be inherited route/shape memory.

Gameplay:
- piles contain unusual salvage;
- attacking the crabs can erase evidence;
- precursor robots sometimes inspect the same piles, creating ambiguous cross-layer scenes.

### 4.15 Blind Shepherds

Large non-predatory organisms emitting pulses that smaller infected animals follow.

They are biological relays, not commanders.

Gameplay:
- killing or driving one away reduces local pack coherence;
- the ecosystem may become more chaotic rather than safer.

## 5. Non-hostile ecology is mandatory

At least half of alien fauna sightings should not begin as combat.

Roles:
- grazers;
- migrants;
- scavengers;
- cleaners;
- nursery organisms;
- pollinator analogues;
- relay species;
- dormant cysts;
- symbiotic pairs.

This prevents "alien life" from becoming another hostile-faction skin.

## 6. Multi-species encounters

The field becomes interesting when species interact.

Examples:
- rays disturb cysts, releasing food for needle swarms;
- shepherd moves a mixed flock;
- predator follows wake eels;
- hull leeches attach to a derelict while archive crabs harvest shed material;
- precursor robot emits a suppression tone and every infected animal in range changes course;
- a dying carrier causes normally hostile species to converge on the spore bloom rather than the player.

The player should sometimes survive by understanding ecology rather than winning DPS.

## 7. Mutation presentation

Mutations should visibly reveal host history.

Use a persistent fungal grammar:
- pale filament bundles;
- red vascular cores;
- repeated nodal branching;
- asymmetrical overgrowth at nerves/sensory organs;
- calcified attachment collars;
- growth oriented toward heat/electrical sources.

Then preserve enough host anatomy to identify the stolen solution:
- mineral armor;
- membrane lift surface;
- electroreceptor fans;
- pressure sacs;
- radiation pigment;
- thermal fins.

A creature should look like an infected lineage, not procedural noise.

## 8. Rare "wrong" behaviors

High-value uncanny moments:
- three species turn simultaneously toward an unseen point;
- an animal performs a docking arc it should not know;
- a pack stops pursuing at an invisible boundary;
- a scavenger arranges debris in a shape matching a precursor glyph;
- a harmless grazer reacts to Wren's ship before the scanner sees it;
- a predator repeatedly refuses to cross a field emitted by an ancient robot;
- several creatures reproduce the timing of an old distress beacon.

These should be sparse enough that players notice.

## 9. Boss-scale organisms without boss-bar logic

Possible giant organisms:
- a carrier the size of a station;
- an asteroid-wrapped anchor beast;
- a hollow wreck colony that can move;
- a migratory membrane crossing an entire sector;
- a relay organism embedded in a derelict carrier.

The encounter objective does not have to be "kill it."
Alternatives:
- pass through;
- collect sample;
- sever attachment;
- rescue trapped ship;
- redirect migration;
- survive its wake;
- disable relay tissue;
- lure it toward or away from a quarantine gate.

## 10. Acceptance

The fauna layer is successful when:
- players can predict some behavior from body language and ecology;
- shooting first is often a bad but understandable choice;
- multiple species create emergent situations;
- the fungus makes creatures more coordinated without making them implausibly intelligent;
- the first five creature families can run without requiring a new character-animation engine;
- alien encounters reward the game's physics verbs rather than bypassing them.
