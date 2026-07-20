# 03 — Living World, Sectors, Planets, and NPC Jobs

## 0. Objective

SpaceFace should stop presenting sectors as loading-screen rooms that happened to be bolted together into open space.

A sector must become a **small causal geography**:

- distinct places separated by meaningful travel;
- visible routes between those places;
- NPCs performing jobs along those routes;
- structures whose function can be inferred from behavior;
- hazards that alter motion, information, or access;
- persistent changes caused by the player.

The world should not merely contain more props. It should contain more **ongoing processes**.

---

# Part I — Spatial composition

## 1. Replace the central pile with activity pockets

A sector should generally contain two to four activity pockets.

Examples:

- civic/station pocket;
- production pocket;
- transit/checkpoint pocket;
- danger/contested pocket;
- mystery/landmark pocket.

Do not require every sector to use every category.

Recommended spacing for current world scales:

- pocket radius: roughly 350–900 world units;
- pocket separation: roughly 1,200–3,000 world units;
- route length: enough to observe traffic and make interception meaningful;
- landmark visibility: silhouette readable from at least one neighboring pocket.

The player should be able to say:

> “The refinery is beyond the belt, the customs ring is on the Helios route, and the graveyard is off-lane in the shadow.”

That sentence describes geography. “Everything is near the center” does not.

## 2. Sector graph data

Extend or project current named-zone and anchor data into explicit activity pockets and routes:

```js
activityPockets: [
  {
    id: 'ceres_refinery',
    role: 'industrial',
    center: { x: -1600, z: 700 },
    radius: 650,
    landmarkRef: 'dmc_refinery_ring',
    jobs: ['miner_return', 'hauler_depart', 'patrol_inspect'],
    services: ['ore_receive', 'refine'],
    persistentStateRef: 'site_ceres_refinery'
  },
  {
    id: 'ceres_deep_seam',
    role: 'extraction',
    center: { x: 600, z: -1300 },
    radius: 850,
    jobs: ['miner_work', 'scavenger_loiter'],
    fieldRefs: ['f_ceres_1', 'f_ceres_3']
  }
],
routes: [
  {
    id: 'ceres_ore_run',
    from: 'ceres_deep_seam',
    to: 'ceres_refinery',
    width: 220,
    trafficProfile: 'industrial_ore',
    beaconSpacing: 360
  }
]
```

The existing named zones can remain semantic authority. This layer answers where physical routes, traffic, props, and events occur.

## 3. Entry placement

Do not spawn or jump the player directly into the same central cluster in every sector.

Possible entries:

- near a gate on a route edge;
- at an orbital approach;
- in a debris corridor;
- at a customs checkpoint;
- outside a storm front;
- near the player’s own infrastructure.

A sector entrance should reveal one silhouette and one navigational decision.

## 4. Empty space with purpose

Empty space is not inherently bad. It is bad when it separates interchangeable clusters.

Useful empty space:

- a lane where convoys can be intercepted;
- an approach where a landmark grows in scale;
- a gravity arc;
- a quiet region hiding an anomaly;
- a patrol boundary;
- a buffer around a hazardous field;
- construction room around a growing player site.

Travel must either reveal, threaten, enable, or frame.

---

# Part II — Sector archetypes

## 5. Industrial belt

**Identity:** extraction sites feed a refinery through exposed ore routes.

Required visible loop:

- miners depart;
- work seams;
- haulers collect;
- refinery receives;
- cargo pods depart.

Player actions:

- mine manually;
- escort or rob ore traffic;
- automate a seam;
- repair a broken extractor;
- disrupt or defend the refinery;
- build a competing site.

Mechanical condition:

- dense collision terrain;
- high-value metallic formations;
- line-of-sight broken by large asteroids.

Hero silhouette:

- refinery ring, furnace spine, or rotating ore crusher.

## 6. Trade junction

**Identity:** multiple routes cross through a customs or market structure.

Visible loop:

- haulers arrive from different directions;
- queue;
- get scanned;
- unload;
- depart.

Player actions:

- trade;
- follow a convoy;
- smuggle through a blind interval;
- rob traffic off-lane;
- repair/disable scanners;
- buy route intelligence.

Mechanical condition:

- traffic corridors and response times;
- law concentrated near checkpoint, weak farther away.

Hero silhouette:

- customs ring, multi-arm exchange, or cargo elevator.

## 7. Ship graveyard

**Identity:** the sector’s terrain is made from large broken vessels.

Visible loop:

- scavengers strip wrecks;
- patrols investigate restricted hulks;
- pirates ambush salvage traffic;
- debris slowly drifts through authored currents.

Player actions:

- scan;
- cut;
- tether;
- recover black boxes;
- fight through hull channels;
- establish automated salvage.

Mechanical condition:

- compound collision;
- dynamic payloads;
- directional debris current;
- restricted salvage.

Hero silhouette:

- carrier halves, capital spine, or kilometre-scale ring wreck.

## 8. Border checkpoint

**Identity:** geography forces travel through a controlled passage.

Visible loop:

- patrols screen traffic;
- smugglers attempt alternate path;
- couriers wait;
- alarms change route behavior.

Player actions:

- submit to scan;
- evade;
- bribe through an existing lightweight interaction;
- disable one sensor node;
- defend or attack checkpoint;
- build a bypass relay later.

Mechanical condition:

- narrow route;
- law field;
- sensor occlusion pockets.

Hero silhouette:

- gate lattice, defense pylons, or scanning arc.

## 9. Anomaly field

**Identity:** movement and information are unreliable.

Visible loop:

- survey vessels triangulate;
- probes disappear/reappear;
- research platforms transmit;
- scavengers wait for quiet windows.

Player actions:

- scan from several bearings;
- deploy probes;
- use massline to align an ancient mechanism;
- exploit a field for slingshots;
- recover displaced payloads.

Mechanical condition:

- gravity/vortex/ion fields;
- intermittent access;
- projectile bending;
- sensor noise.

Hero silhouette:

- alien ring, crystal lattice, or oscillating machine.

## 10. Pirate-held ruin

**Identity:** a broken industrial or military structure has become a functioning outlaw settlement.

Visible loop:

- stolen cargo arrives;
- raiders depart;
- repair drones service pirate ships;
- lookouts patrol approach routes.

Player actions:

- trade at black market;
- infiltrate via debris channels;
- attack power/components;
- steal cargo;
- follow raiders;
- eventually clear or claim the site.

Mechanical condition:

- layered defenses;
- destructible/disable-able components;
- escape routes.

Hero silhouette:

- scavenged station welded into a wreck.

## 11. Construction frontier

**Identity:** a new station or megastructure visibly grows over time.

Visible loop:

- construction drones carry modules;
- freighters deliver material;
- defense ships protect frame;
- new arms light up as stages complete.

Player actions:

- deliver materials;
- defend;
- sabotage;
- attach modules;
- choose build order without exclusive story lockouts;
- eventually use the completed structure.

Mechanical condition:

- persistent staged visuals;
- physical payload receivers;
- route demand.

Hero silhouette:

- skeletal station frame.

## 12. Quiet sanctuary

**Identity:** low traffic and low threat make subtle activity readable.

Visible loop:

- research craft;
- memorial traffic;
- pilgrims or couriers;
- maintenance drones.

Player actions:

- discover story evidence;
- perform precision scan;
- repair old infrastructure;
- hide from pursuit;
- build a low-signature relay.

Mechanical condition:

- cloak/sensor play;
- no ambient combat spam.

Hero silhouette:

- memorial array, silent habitat, or light sail.

## 13. Active war zone

**Identity:** conflict has geography and supply, not random enemy clusters.

Visible loop:

- reinforcements arrive from owned routes;
- damaged ships retreat;
- wrecks persist;
- supply carriers matter;
- control points alter spawning.

Player actions:

- interdict supply;
- rescue disabled ships;
- defend artillery;
- salvage aftermath;
- shift local control.

Mechanical condition:

- persistent battle damage;
- causal reinforcements;
- terrain anchors.

Hero silhouette:

- contested fortress or destroyed capital.

## 14. Player expansion region

**Identity:** the sector changes most visibly because of the player.

Visible loop after development:

- player couriers;
- drones;
- construction;
- defenses;
- visiting traders;
- competing/attacking factions.

Mechanical condition:

- asteroid-site output;
- station assembly;
- infrastructure placement;
- traffic growth.

Hero silhouette:

- whatever the player built.

---

# Part III — NPC jobs

## 15. Miner

### States

1. depart station or tender;
2. transit along ore route;
3. approach selected asteroid;
4. scan/contact;
5. hold working position;
6. beam or deploy mining drone;
7. accumulate manifest;
8. return;
9. unload.

### Visible behavior

- miner hull silhouette;
- industrial beam;
- occasional ore pod;
- scan-readable cargo;
- route marker.

### Player interactions

- escort;
- rob after disabling;
- follow to productive seam;
- rescue when stranded;
- sell fuel/repair only if such services remain light;
- compete for a high-value formation.

### Failure modes to forbid

- miner wanders randomly inside field;
- `role: miner` exists only in data;
- beam points nowhere;
- ore appears without a trip;
- miner uses combat AI during ordinary work.

## 16. Hauler / caravan

### States

- load at producer;
- form convoy;
- depart;
- transit;
- checkpoint;
- arrive;
- unload;
- return or select next route.

### Manifest

Scanning should reveal:

- cargo type/value;
- origin/destination;
- escort strength;
- legal status;
- route.

### Crime loop

The player may:

- shadow convoy;
- disable engines/RCS;
- detach or force jettison cargo pods;
- tether pods;
- flee patrol response;
- fence cargo.

This is the beginning of “GTA in space.” It does not require a sprawling dialogue system.

### Security

Escorts have one job:

- stay in formation;
- respond when convoy attacked;
- cover retreat;
- disengage after cargo is safe/lost.

Do not ask them to solve arbitrary tactical warfare.

## 17. Patrol

### Route

- follows authored corridor;
- pauses at checkpoint;
- scans ships;
- responds to weapon fire, distress, or high heat;
- returns.

### Readability

- authority lights;
- predictable route;
- scan cone or ring;
- clear escalation state.

### Player interaction

- observe timing;
- comply;
- evade;
- lure away;
- attack and create consequences;
- restore patrol capacity in unsafe region.

## 18. Scavenger

- receives rumor or detects aftermath;
- travels to wreck;
- scans;
- cuts/tethers a payload;
- tows it to yard or strips it;
- may compete with player.

A scavenger makes wrecks feel valuable without a tooltip.

## 19. Survey vessel

- follows triangular or orbital path;
- emits scan pulses;
- deploys probes;
- marks a signal;
- returns to research station.

The player can follow the pattern, steal data, protect the survey, or complete missing bearings.

## 20. Construction traffic

- freighter arrives with module;
- crane drone extracts module;
- module moves to frame;
- frame state changes;
- traffic departs.

This is a cheap “cutscene” made from gameplay objects.

## 21. Rescue tug

- responds to distress;
- attaches to disabled craft;
- tows or repairs;
- may be attacked.

The player can help, steal the disabled ship’s cargo, or protect the tug.

## 22. Smuggler

- travels ordinary route until checkpoint;
- diverts into occlusion pocket;
- meets hidden receiver;
- returns.

Following one can reveal black markets or secret structures.

## 23. Pirate predator

Pirates should not simply exist as red ships.

Job:

1. loiter at ambush pocket;
2. observe manifests;
3. select valuable vulnerable traffic;
4. intercept;
5. issue a brief demand or attack;
6. steal cargo;
7. retreat to ruin.

Even a simple state machine creates motivation.

---

# Part IV — Player interaction with ordinary traffic

## 24. Scan

Scan should produce actionable information, not only lore:

- cargo;
- destination;
- damaged subsystem;
- active job;
- affiliation;
- bounty or restricted cargo;
- hidden tether/cut points;
- route vulnerability.

## 25. Hail without dialogue trees

Use one-line contextual actions:

- `REQUEST MANIFEST`
- `DEMAND CARGO`
- `OFFER ESCORT`
- `REQUEST DISTRESS STATUS`
- `WARN OF AMBUSH`

The result can be deterministic from reputation, strength, and context. No long conversation.

## 26. Disable and steal

A crime system becomes interesting when destruction is not the only option.

Needed primitives:

- engine/RCS component disable;
- cargo pods or jettison;
- physical pickup/tether;
- response heat;
- patrol arrival from real route;
- fence destination.

## 27. Follow

A subtle but valuable verb:

- target a ship;
- use pursuit mode at distance;
- do not attack;
- ship continues its job;
- following reveals destination, hidden site, or event.

This turns existing traffic into navigation/story content.

---

# Part V — Planets and orbital operations

## 28. Do not build planetary landing first

Planets can become mechanically rich through orbital structures and fields.

A planet is:

- a dominant visual anchor;
- a gravity field;
- an atmosphere boundary;
- a host for orbital routes;
- a source/sink for cargo;
- a place whose installations can change.

## 29. Orbital elevator terminal

Visible elements:

- equatorial ground tether rising toward orbital counterweight;
- cargo terminal;
- moving capsules or lights;
- queue of haulers.

Interactions:

- retrieve launched cargo;
- defend terminal;
- repair relay nodes;
- rob cargo at transfer point;
- build/upgrade orbital receiver.

No surface gameplay required.

## 30. Satellite constellation

Several analytic orbiters:

- communications;
- weather;
- navigation;
- defense;
- survey.

Interactions:

- scan from correct orbital positions;
- repair one satellite;
- replace a missing node;
- hack/disable;
- align constellation;
- extend player sensor coverage.

Avoid “press E at each.” Use scan, beam repair, payload installation, or tether alignment.

## 31. Atmospheric harvester

- skims upper atmosphere analytically;
- transfers gas to orbital depot;
- emits visible plume;
- vulnerable at predictable points.

Player can:

- install extractor;
- defend;
- collect capsule;
- adjust orbit;
- use output in Asteroid Ops.

## 32. Surface-to-orbit mass driver

- periodically launches cargo capsules;
- visible trajectory;
- receiver catches them;
- missed launches become salvage;
- player may intercept.

This creates world activity and a physics toy.

## 33. Mining ring

- partial orbital ring around moon/planet;
- material moves along it;
- sections can be repaired or sabotaged;
- massline anchors permit traversal;
- construction can extend ring.

## 34. Research platform

- points instruments toward anomaly or surface;
- generates scan patterns;
- needs power or alignment;
- unlocks illustrated ledger evidence and new coordinates.

## 35. Colony evacuation

A live event:

- shuttles launch in waves;
- hostile force approaches;
- player defends routes;
- disabled shuttle can be towed;
- cargo/passenger abstraction remains in manifests;
- outcome changes orbital population/traffic state.

No cutscene needed.

## 36. Defense array

- several emitter satellites;
- overlapping coverage;
- can be disabled by component attacks;
- protects traffic or hostile region;
- player can repair, capture, or bypass.

## 37. Abandoned habitat

- large collision-aligned structure;
- dark sections;
- emergency power nodes;
- salvage;
- illustrated records;
- eventual claim or reuse.

---

# Part VI — Gravity as sector identity

## 38. Stylized gravity sector

Begin with one sector built around one large body.

Required:

- clear influence boundary through particles/background;
- trajectory preview;
- one fast route that uses a close pass;
- one slow safe route outside;
- orbital traffic;
- atmosphere interaction;
- an impulse/massline opportunity.

The player should learn gravity through repeated ordinary travel, not a tutorial screen.

## 39. Chaining gravity assists

Do not begin with three freely orbiting planets.

A manageable first chain:

- one planet;
- one moon on analytic orbit;
- one acceleration ring;
- destination station.

The player can:

1. use planet swing;
2. intercept moon side;
3. pass through ring;
4. reach station faster.

The route preview may show waypoints and projected arcs.

## 40. Enemy atmospheric destruction

Requirements:

- enemy receives real impulse/tether trajectory;
- atmosphere crossing triggers escalating burn state;
- ship breaks into a few debris pieces;
- no instant disappearance;
- story/combat receipt attributes kill;
- player gets readable payoff.

Do not make every enemy easy to push. Mass, RCS, and distance matter.

---

# Part VII — Hazards that are not damage circles

## 41. Moving ion storm

- field center/shape moves on deterministic path;
- hides scanner contacts;
- bends or disrupts projectiles;
- exposes wreck during quiet window;
- player may deploy beacon to track it.

## 42. Gravitational eddy

- localized vortex field;
- alters trajectories;
- can be exploited for turn/boost;
- pulls debris into an orbiting belt.

## 43. Debris current

- continuous directional force;
- carries small payloads;
- larger hulls resist;
- tether to fixed anchor to work inside current;
- hidden salvage periodically passes.

## 44. Radiation corridor

- hazard opens/closes or sweeps;
- shield/heat consequence;
- not pure DPS: sensor interference, component heat, trajectory timing;
- provides safe window.

## 45. Resonant crystal formation

- several movable/rotatable nodes;
- massline changes alignment;
- correct geometry activates signal/route;
- visible beam or resonance;
- wrong arrangement is reversible.

## 46. Dormant alien ring

- component nodes;
- power/position requirements;
- aligns via tether or installed modules;
- opens shortcut, gravity field, or story coordinate.

## 47. Displacement anomaly

- moves tagged payloads between two points or mirrors velocity;
- strongly telegraphed;
- used for puzzles and combat;
- deterministic;
- no random confiscation of player cargo.

---

# Part VIII — Landmark and asset grammar

## 48. Three-scale readability

Every hero structure must read at:

### Far scale

At 1,000–2,000 world units:

- unique silhouette;
- dominant axis;
- emissive signature;
- no reliance on texture detail.

### Mid scale

At 300–800 units:

- function becomes obvious;
- routes, arms, bays, broken sections, or moving machinery read;
- player knows where to approach.

### Near scale

At 50–250 units:

- components;
- docking mouth;
- braces;
- windows/decals;
- damage;
- interaction cues.

## 49. Modular visual kits

To let three agents create volume without every sector looking cloned, build six reusable hard-surface kits:

1. **Concord civic:** clean panels, cool emissives, rings, regulated symmetry.
2. **DMC industrial:** trusses, furnaces, orange work lights, exposed machinery.
3. **Reach/pirate:** asymmetry, scavenged plates, tags, improvised armor.
4. **Quiet covert:** dark low-signature geometry, narrow lights, hidden bays.
5. **Vael/alien:** unfamiliar curves or segmented structures, nonhuman rhythm.
6. **Ancient/derelict:** eroded megastructure, dead emissives, broken scale.

Each kit includes:

- structural modules;
- connector modules;
- docking/receiver modules;
- antenna/sensor modules;
- damage variants;
- material presets;
- decals;
- collision proxy conventions;
- LODs.

Variation should come from silhouette and composition, not only recoloring.

## 50. Named advanced techniques for agent prompts

Use these phrases when relevant:

- silhouette-first graybox;
- hard-surface modular kitbashing;
- weighted normals;
- beveled edges sized for gameplay camera;
- physically based metal/roughness;
- trim-sheet or atlas workflow;
- decal layering;
- emissive hierarchy;
- instancing;
- HLOD;
- collision proxy manifest;
- gameplay-camera texel-density review;
- top-down occlusion/readability test;
- screen-space constant-width lines;
- analytic orbit;
- pure-pursuit steering;
- PD controller;
- spatial-hash query;
- deterministic state machine.

“Use advanced techniques” is too weak. Name the technique and the observable result.

---

# Part IX — Twelve pasteable sector seeds

## 51. Broken Moon Refinery

A scorched moon with a segmented refinery ring, one half dark. Miners still deliver ore to the surviving half. Player repairs power couplings and eventually claims the dead half for Asteroid Ops exports. Gravity and ring collision create curved routes.

## 52. Carrier Grave

A capital carrier lies split into five collision islands. Scavengers tow modules through channels; pirates hide behind the engine block. Restricted command section contains a blueprint and illustrated ledger sequence.

## 53. Customs Gauntlet

All safe trade routes pass through three scanning arcs. Smugglers use a radiation shadow. Player can comply, follow smugglers, disable one scanner component, or later build a legal bypass after gaining regional control.

## 54. Storm Vault

A moving ion storm hides an ancient vault. Survey vessels triangulate the clear window. Projectiles bend or lose lock in the storm. The vault becomes reachable through timing and sensor infrastructure.

## 55. Cinder Crown

A volcanic/industrial body with surface launchers firing cargo into orbit. Capsules cross a dangerous pirate lane. Player can intercept, defend, or build an orbital receiver.

## 56. The Rookery

A dense asteroid field with many small independently operated sites. Traffic is miners and courier pods, not generic wandering ships. The player’s first automated asteroid visibly joins the network.

## 57. Silent Exchange

A covert station lies inside a sensor-dead nebula. Traffic goes dark before entering. Following a ship reveals the approach. The station has no giant UI difference; its world route and access behavior create identity.

## 58. Pilgrim Array

A memorial constellation orbits a dead planet. No combat unless provoked. Scanning satellites unlocks illustrated records and eventually activates a navigation relay.

## 59. Iron Maw Siege

A fortress sits behind a debris current and defense-array coverage. Supply carriers sustain it. Interdicting supplies changes the battle before direct attack.

## 60. Lantern Construction Front

A station frame grows in stages around a player-accessible resource pocket. Construction drones and freighters are constant visible activity. Player contributions become actual modules.

## 61. Pale Coil Route

An alien acceleration ring and gravity eddy create a fast but difficult traversal line. Mastery opens a meaningful shortcut; ordinary route remains available.

## 62. Blackglass Lease

A dark player-claimable asteroid near an outlaw route. High production signature attracts predation. Quiet running and sensor infrastructure matter more than upkeep timers.
