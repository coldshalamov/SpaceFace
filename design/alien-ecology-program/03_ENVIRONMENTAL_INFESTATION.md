# 03 — Environmental Infestation

## Goal

Make contamination physically reshape places without requiring bespoke replacement models for every station, wreck, asteroid, and structure.

The correct asset strategy is a reusable infestation grammar layered over existing authored geometry.

## 1. Modular infestation kit

Create a small high-quality kit that can be deterministically placed on many hosts.

Suggested modules:

1. filament_sheet — thin branching web for panels and hull seams;
2. nerve_bundle — thicker white-red cable growth;
3. node_bulb_small — local relay or nutrient node;
4. node_bulb_large — hero prop / weak point / scan target;
5. cyst_cluster — dormant reproductive sacs;
6. membrane_patch — translucent biological sheet across gaps;
7. calcified_collar — hard growth around pipes, beams, or attachment points;
8. tendril_cluster — articulated/procedural reach into free space;
9. vent_lung — rhythmic gas-exchange organ for pressurized sites;
10. spore_chimney — particulate emitter;
11. mineral_root — growth penetrating asteroid or slag;
12. sensory_fan — electroreceptive/photoreceptive structure.

A single infected location should combine several modules with consistent orientation rules.

## 2. Placement grammar

Do not sprinkle meshes randomly.

Growth follows resources and geometry:
- seams and cable runs;
- warm reactors;
- vents;
- water/ice;
- structural cavities;
- electrical buses;
- exposed biological material;
- low-flow corners where spores settle;
- fracture lines in rock.

Deterministic placement can use:
- authored sockets on hero assets;
- mesh-local anchor metadata;
- seeded surface candidates on simpler props;
- zone-authored growth clusters.

The same wreck should re-materialize with the same infection pattern after Continue.

## 3. Infection states for structures

### State 0 — clean

No visible growth.

### State 1 — trace

- tiny filament veins;
- forensic residue;
- one sealed panel;
- scanner only.

### State 2 — foothold

- visible patches;
- local cysts;
- minor spore emission;
- some systems still operate.

### State 3 — colonized

- multiple connected growth regions;
- active biological organs;
- environmental hazards;
- fauna residency.

### State 4 — integrated

- biology uses structure as skeleton;
- doors/vents/reactors become part of ecological function;
- geometry may be bridged by membranes/tendrils;
- original object's function is secondary.

### State 5 — transformed

- player can no longer confidently classify object as station, wreck, reef, or organism;
- reserved for deep regions and hero sites.

## 4. Infected wreck language

Wrecks are the cheapest high-value substrate because SpaceFace already has salvage and derelict grammar.

Variants:
- cold wreck with dormant filament traces;
- warm wreck acting as nursery;
- wreck dragged into a cluster by fauna;
- multiple wrecks bridged into a colony;
- wreck with engine intermittently firing because tissue stimulates surviving control lines;
- wreck where fungal growth preserves a cockpit or neural interface because it remains electrically useful;
- wreck whose cargo is untouched but hull is biologically integrated;
- wreck with precursor quarantine clamp still attached.

Each tells a different story with mostly shared assets.

## 5. Infected stations

Do not infect every station. A colonized station should be an event.

Possible forms:
- evacuated outer ring, inner habitat still inhabited;
- sealed deck visibly pulsing behind pressure doors;
- failed research wing;
- station that continues automated trade while biological takeover spreads through unused sections;
- pirate den using contaminated growth as defense;
- abandoned refinery whose heat exchangers now support a huge ecosystem;
- half-functioning comms array broadcasting both human loop and biological field harmonic.

Station infestation is strongest when human function and alien function overlap rather than one simply replacing the other.

## 6. Infected asteroids and belts

Forms:
- mineral roots following ore seams;
- cyst fields hidden in shadowed craters;
- asteroid hollowed into nursery;
- shell organisms attached to spin axis;
- migratory animals scraping one belt while ignoring another;
- biological bridges between close fragments;
- "dead" rock with thermal bloom on scan.

Gameplay:
- mining can awaken or expose colonies;
- rich core may be biologically contaminated;
- some seams become bait;
- fungus can make an asteroid valuable rather than merely dangerous.

## 7. Spore fields

Use particle volume sparingly.

A spore field should have gameplay meaning:
- scanner attenuation;
- filter load;
- wake visibility;
- fauna attraction;
- ignition or charge interaction if scientifically/artistically justified;
- contaminated salvage risk.

Avoid generic fog that simply lowers visibility everywhere.

## 8. Shared-field environmental cues

The neural field is not visible magic.

Represent it indirectly:
- low-level interference aligned across several instruments;
- repeated audio phase artifacts;
- momentary synchronized fauna motion;
- target IDs flickering between separate contacts;
- scanner echo persistence after an organism leaves;
- slight timing shifts in comms;
- biological nodes pulsing in phase over distance.

At high contamination:
- several independent growths pulse together;
- sound sources phase-lock;
- map contacts briefly merge;
- the player hears a pattern before seeing its source.

## 9. Audio language

Build a hierarchy.

Trace:
- nearly subliminal broadband hiss;
- occasional dry filament tick;
- one impossible duplicate echo.

Colonized:
- soft wet friction;
- cyst creak;
- electrostatic pulse;
- fauna calls with repeated timing.

Networked:
- multiple unrelated sounds synchronize;
- low harmonic bed appears only near relays;
- damaged organisms cause distant responses.

Domain threshold:
- environmental audio feels organized without becoming music;
- silence may be more important than noise;
- Vethari-linked harmonic can trigger Wren-specific reactions without exposition.

Avoid monster roars as the default.

## 10. Lighting and material language

Biological:
- mostly non-emissive tissue;
- local bioluminescence only where it has function;
- wet translucency in thin membranes;
- matte/calcified mineral surfaces elsewhere;
- white-red filament identity from canon, not neon slime.

Precursor machine:
- opposite language;
- clean geometry;
- low-noise surfaces;
- precise light;
- controlled emissive lines;
- no organic pulse.

Scenes containing both should read instantly as two different historical systems in conflict.

## 11. Scanner language

The scanner is the player's microscope.

Possible readouts evolve with revelation level:

Early:
- UNKNOWN ORGANIC FILM
- TRACE CONDUCTIVITY
- SOURCE UNRESOLVED

Mid:
- FILAMENT NETWORK
- ACTIVE METABOLISM
- FIELD COHERENCE: LOW
- HOST MATERIAL: MULTIPLE

Late:
- VETHARI-LINKED SIGNATURE
- HOST SHADOW DETECTED
- RELAY PROBABILITY
- DEEP TRACE PRESENT
- PRECURSOR SUPPRESSION ACTIVE

The scanner can reveal anatomy:
- nutrient flow;
- neural hotspots;
- cyst load;
- relay tissue;
- contamination paths into machinery.

This creates gameplay without a new UI mode if layered onto existing scanner behavior.

## 12. Environmental hazards

Candidate hazards:
- filter saturation;
- corrosive metabolic byproduct;
- adhesive tendril fields;
- electrical induction from relay masses;
- sensor ghosting;
- spore contamination;
- pressure-sac rupture;
- biological obstruction of moving machinery;
- attraction of predators after loud mining;
- dormant cyst activation under heat.

Prefer hazards that create choices over passive damage-over-time.

## 13. Environmental opportunities

Alien biology should also be useful.

Examples:
- warm growth marks functioning power in a wreck;
- migrating fauna lead to hidden gas pockets;
- relay nodes expose nearby contacts;
- calcified tissue is valuable industrial material;
- membrane tissue can be engineered into lightweight damping material;
- spore patterns reveal airflow through a station;
- precursor suppression zones are safe corridors through dense ecology;
- infected wrecks preserve data because tissue maintained power.

## 14. Transformation over distance

The art progression should change topology, not just density.

Low C:
human object + tiny foreign detail.

Medium C:
human object with biological occupation.

High C:
human object serving biological function.

Very high C:
biology uses many human objects as one structure.

Threshold:
human categories fail.

That is the visual story of approaching the domain.

## 15. Performance rules

- Favor instanced repeated modules where visual identity survives.
- Keep cosmetic filament microdetail shader/material-based where possible.
- Pool spores and transient VFX.
- Distant colonies collapse to low-frequency animation and low-detail meshes.
- Avoid hundreds of independently ticking tendrils.
- Use shared phase parameters for coordinated pulse instead of separate timers.
- Preload/precompile new material variants before deep-sector traversal.
- Measure transparent overdraw in dense infestation scenes.
- Treat the first dense colony as a new performance scenario before scaling content.

## 16. Acceptance

An infected site is successful when:
- its growth appears to have followed resources and geometry;
- the player can estimate severity without a UI number;
- the same kit produces visibly different sites;
- close inspection rewards curiosity;
- the site has at least one gameplay consequence and one ecological story;
- performance cost grows sublinearly with apparent visual density.
