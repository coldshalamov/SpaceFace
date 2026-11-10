# 01 — Contamination Model

## Purpose

The alien ecology needs one reusable systemic variable so the game can become progressively stranger without hand-authoring every possible combination of fungus, fauna, wreck, mission, scanner result, and encounter.

The model should describe "how strongly this place participates in the Vethari-linked ecology" while keeping physical contamination separate from narrative revelation.

## 1. Two axes, not one

Do not use story progress as a magical infection slider.

Use two independent quantities:

### C — contamination pressure

C is a physical/ecological quantity associated with a sector, zone, site, or entity.

Conceptually:

C = clamp(G + L + T + E, 0, 1)

where:
- G = geographic/historical baseline for the sector;
- L = local site contribution, such as a colonized wreck or spore nursery;
- T = optional slow world-time drift if the campaign later supports spread;
- E = persistent event contribution from actual world events.

C should be deterministic and save-stable.

### R — revelation/access

R is what the player currently knows or can reach.

R controls:
- scanner interpretation;
- terminology;
- map annotations;
- mission visibility;
- whether a signal is presented as "unknown biological" or identified as a known contamination signature;
- access to quarantined routes or deep-domain sectors.

R does not create fungal mass. It changes what the player can understand and where they can travel.

This distinction is foundational.

## 2. Contamination bands

Use named bands for authored intent while retaining a continuous numeric value for tuning.

### C0 — CLEAN / background

Typical range: 0.00–0.05.

Expected content:
- no overt growth;
- at most one rumor or suspicious lab flag;
- no infected combat fauna;
- no contamination gameplay penalty.

Purpose: establish a control group. Horror requires normal space.

### C1 — TRACE

Typical range: 0.05–0.20.

Expected content:
- residue on wrecks;
- false-positive scanner pings;
- quarantine labels;
- microscopic filaments;
- rare spore cysts;
- odd animal route behavior;
- one-off reports dismissed as corrosion or contamination.

Gameplay:
- scanner can flag "organic anomaly";
- clean salvage remains normal;
- rare contaminated salvage begins.

### C2 — COLONIZED

Typical range: 0.20–0.40.

Expected content:
- visible fungal patches;
- infested derelicts;
- non-hostile infected fauna;
- local relay growths;
- sealed habitats;
- spore clouds around wreck fields.

Gameplay:
- contamination becomes a route consideration;
- first dedicated anti-contamination equipment matters;
- fauna encounters can replace or modify ordinary mystery encounters;
- salvage has quarantine handling.

### C3 — ACTIVE ECOLOGY

Typical range: 0.40–0.60.

Expected content:
- multiple host species;
- food-web behavior;
- defensive swarms;
- larger carrier organisms;
- networked hunting;
- infected human infrastructure;
- recognizable strain identity.

Gameplay:
- encounter director gets alien ecology decks;
- relay organisms affect local behavior;
- scanner noise and false contacts become meaningful;
- environment and combat overlap.

### C4 — NETWORKED REGION

Typical range: 0.60–0.80.

Expected content:
- persistent shared-field effects;
- wreck clusters physically bridged by growth;
- abandoned station sections functioning as organs;
- fauna with strong route-memory;
- old quarantine machinery;
- precursor structures responding to contamination.

Gameplay:
- navigation itself changes;
- some regions punish ordinary autopilot;
- special filters and field tools become important;
- player actions can temporarily disrupt local coordination but not "cure" the region.

### C5 — DOMAIN THRESHOLD

Typical range: 0.80–1.00.

Expected content:
- biology has colonized geography at large scale;
- the distinction between derelict, habitat, and organism becomes uncertain;
- fungal field phenomena affect sensors, audio, and target classification;
- Vethari-scale architecture or vessel evidence becomes possible;
- precursor containment systems become major landmarks.

Gameplay:
- ordinary human encounter grammar becomes sparse;
- escape, observation, route choice, and environmental interaction matter more than kill count;
- the player should feel they crossed into somewhere humans are not the default life-form.

C5 is not "everything is red and deals damage." It is ontological pressure.

## 3. Spatial structure

Contamination should be heterogeneous.

Within one sector:
- clean trade lane;
- trace-contaminated wreck;
- active bloom inside a derelict field;
- protected precursor exclusion volume.

Use the existing named-zone system as the natural authoring surface.

Recommended data shape, illustrative only:

alienEcology:
  contaminationBase: 0.18
  strainId: "strain_charon_01"
  traits: [...]
  siteOverrides:
    zone_charon_bloom: 0.52

Do not overload factionId to mean contamination.

## 4. Sources of contamination

A site's C should have a reason.

Possible sources:
- Vethari passage centuries ago;
- contaminated hull fragments;
- infected fauna migration;
- colonized wreckage;
- abandoned research site;
- failed quarantine;
- infected cargo accident;
- spores released by destruction of a carrier organism;
- a historical battle involving contaminated hulls;
- drift from a nearby world;
- a hidden dormant colony;
- unknown source kept deliberately unexplained.

Every high-C location should answer "why here?" even if the player cannot immediately know the answer.

## 5. Strains

C says how much. Strain says what kind.

A strain is not a new fungus species. It is a local ecological lineage produced by host history and selection.

Suggested strain fields:
- strainId;
- dominantHostFamilies;
- sensoryBias;
- aggressionBias;
- relayDensity;
- fieldCoherence;
- sporePersistence;
- mutationProfile;
- knownAvoidances;
- rememberedStimuli;
- visualMotifs;
- salvageProfile.

Examples:

### Charon Grave strain
Hosts: wreck scavengers, cyst floaters.
Bias: reactor warmth and ferrous wreck surfaces.
Behavior: mostly defensive.
Memory: avoids DMC mining pulse frequencies.
Visual: pale branching tissue with rusty mineral inclusions.

### Veil Glass strain
Hosts: transparent rays, sensor parasites.
Bias: electromagnetic emissions.
Behavior: inquisitive until illuminated with active scan.
Memory: strong avoidance of precursor prism tones.
Visual: translucent membranes, sparse red filament cores.

### Ashfall Choir strain
Hosts: large carriers and colonized infrastructure.
Bias: synchronized route-following.
Behavior: high field coherence.
Memory: repeated approach vectors toward a deep-domain bearing.
Visual: dense white-red bundles, rhythmic emission pulses.

The names can remain internal until the player has earned enough biological literacy.

## 6. Memory and behavioral priors

Do not simulate a neural network for the hive.

Represent network memory as a small deterministic set of traits with confidence or strength.

Examples:
- avoids_beam_band_A: 0.6
- follows_reactor_heat: 0.8
- recognizes_station_dock_cycle: 0.3
- precursor_signal_fear: 0.95
- massline_contact_aversion: 0.2

These values can drive behavior selection, encounter composition, and scanner interpretation.

If later implementation allows adaptation from player behavior, update only at coarse ecological events:
- after N relevant encounters;
- at save-stable day ticks;
- after a colony survives a specific pressure;
- when a strain is seeded into another site.

Never update every frame.

## 7. Spread model

Version 1 should not include free-running galaxy spread.

Why:
- the campaign needs authored pacing;
- persistent ecological spread multiplies save complexity;
- unbounded spread can erase human content;
- it creates tuning and testing burden before the ecology is proven fun.

Phase 1 recommendation:
- contamination is authored + event-driven;
- infection can spread within a site during an encounter;
- selected missions can permanently alter a site's state;
- regional baselines are static.

Possible later model:
- day-tick diffusion along specific migration edges, not generic adjacency;
- precursor quarantine gates can block edges;
- destroyed carriers reduce future seeding probability;
- contaminated salvage moved by the player can create tiny local events.

If dynamic spread is ever added, it should remain slow enough to read causally.

## 8. Entity contamination state

Individual entities can carry a compact contamination descriptor:

- none;
- exposed;
- colonized;
- integrated;
- carrier.

This is orthogonal to health.

Examples:
- a ship can be intact but colonized;
- a wreck can be integrated into a stationary colony;
- an animal can be a carrier without being behaviorally networked at the moment;
- a cargo item can be exposed but non-replicating.

This enables missions and salvage without making infection a second health bar.

## 9. Player exposure

Do not turn the game into survival-horror infection management unless explicitly desired later.

Player-facing exposure should initially be ship/logistics risk:
- contaminated cargo restrictions;
- sensor interference;
- filter wear;
- hull attachment;
- temporary module faults;
- docking refusal;
- quarantine fees;
- station decontamination.

Human infection can remain narrative and rare because current canon says human colonization is slow and neurologically limited.

## 10. System outputs

Contamination pressure should feed existing systems through narrow interfaces.

World:
- dressing density;
- POI variants;
- hazard tags.

Encounter director:
- ecology encounter eligibility;
- weights;
- field intensity.

Scanner:
- biological signatures;
- false returns;
- strain clues.

AI:
- shared threat/interest modifiers;
- relay bonuses;
- pack coherence.

VFX/audio:
- spore density;
- filament pulse;
- field harmonics;
- local ambience.

Salvage/cargo:
- contaminated lots;
- special resources;
- quarantine tags.

Missions:
- sampling;
- extraction;
- rescue;
- containment;
- observation;
- route reopening;
- missing-crew investigations.

Map:
- known contamination overlays after sufficient R.

Narrative:
- language evolves as player knowledge improves.

## 11. Design acceptance

The model succeeds when:
- an author can make a region feel more infected mainly by changing data;
- two high-C regions can still feel different because strains and site history differ;
- the player can infer contamination severity before reading a number;
- story progress does not visibly spawn biology from nowhere;
- clean space remains clean enough for contrast;
- the same model drives visuals, behavior, rewards, and narrative terminology.
