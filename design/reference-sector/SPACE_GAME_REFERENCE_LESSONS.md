# Space-Game-Specific Reference Lessons

This note adds direct lessons from major space and sandbox games to the broader AAA production research. It is not a feature-comparison checklist. The goal is to identify which production principles should shape the Ceres reference slice and later sector rollout.

---

## 1. No Man's Sky — procedural breadth still requires artistic control

Relevant talks:

- [Art Direction Bootcamp: How I Learned to Love Procedural Art](https://www.gdcvault.com/play/1021805/Art-Direction-Bootcamp-How-I)
- [Continuous World Generation in No Man's Sky](https://www.gdcvault.com/play/1024265/Continuous_World_Generation_in__No_Man_s_Sky_)
- [Do Artists Dream of Electric Sheep?](https://www.gdcvault.com/play/1021935/Do-Artists-Dream-of-Electric)

### Lesson

Procedural scale does not remove the need for art direction. It increases the need for:

- constrained grammars;
- curated visual families;
- tools that keep artists close to final output;
- population/simulation architecture that turns generated space into a place;
- explicit quality control over combinations.

### Application to SpaceFace

SpaceFace should not deepen sectors by scattering more randomized content across a larger radius.

Use procedural or data-driven systems only inside an authored sector thesis:

- Ceres chooses the four pocket identities and their routes;
- occupational ships and yard props come from controlled families;
- the composer selects combinations appropriate to each workplace;
- activity and events populate those authored relationships;
- normal-route review rejects combinations that read as noise or generic reuse.

The correct reuse target is **controlled variation inside a strong authored composition**, not infinite combinations.

---

## 2. EVE Online — sandbox value comes from self-sustaining systems and legible rules

Relevant talks:

- [The Other White Meat: Design Architecture for Sandbox Games](https://gdcvault.com/play/1016600/The-Other-White-Meat-Design)
- [Crimewatch 2.0: Redesigning EVE Online's Policing System](https://gdcvault.com/play/1020218/Crimewatch-2-0-Redesigning-EVE)

### Lesson

A sandbox becomes durable when systems produce opportunity for one another and when aggression, ownership and consequence are legible enough that players can intentionally exploit them.

The Crimewatch redesign is especially relevant: legacy complexity can make crime systems difficult to reason about, and the professional response is to isolate the core design flaws and rebuild the rule model around understandable states—not keep layering special cases.

### Application to SpaceFace

The Ceres slice should establish a small causal economy/crime loop:

```text
resource work
→ cargo movement
→ valuable route
→ interception opportunity
→ witnessed aggression / heat
→ lawful or service response
→ salvage, delivery, theft or loss
```

The player should understand:

- who owns the cargo;
- what action becomes criminal;
- who witnessed it;
- what response is likely;
- what can be stolen or recovered;
- how to escape or de-escalate.

Do not simulate a complete regional economy for the slice. Do make the visible cargo/job/event chain use the real cargo, economy, heat, faction and aftermath owners so its consequences are consistent.

Do not treat a neutral traffic actor labeled “pirate” as crime. Actual hostility and lawful response must come from their authoritative systems.

---

## 3. Outer Wilds — opportunity can be diegetic rather than mission-issued

Relevant talk:

- [Sparking Curiosity-Driven Exploration Through Narrative in Outer Wilds](https://www.gdcvault.com/play/1027368/Independent-Games-Summit-Sparking-Curiosity)

### Lesson

Players can be motivated to explore an open world without explicit mission assignment when the environment creates questions, visible change and understandable leads.

### Application to SpaceFace

Ceres should offer activities that are discoverable through observation:

- a miner visibly cutting a rich seam;
- a hauler departing with valuable cargo;
- an escort changing formation;
- a distress light and repair tender response;
- scavengers converging on new wreckage;
- a suspicious ship breaking away from inspection;
- a physical trail leading toward the Cathedral;
- a construction delivery changing a worksite.

The HUD may identify targets and consequences, but it should not be the sole source of the opportunity.

The reference-sector acceptance should ask:

> Did the player notice something, become curious, follow it and discover an interaction without first opening a mission board?

---

## 4. DUST 514 / EVE universe — modular environments need composition rules to create variation

Relevant talk:

- [DUST 514: Reflecting the Universe](https://gdcvault.com/play/1018883/DUST-514-Reflecting-the)

### Lesson

Large numbers of environments can be produced from modular systems, but variation must be designed into the kit and its assembly rules. A kit is a production multiplier only when combinations preserve function, readability and world identity.

### Application to SpaceFace

The Everyday Space kit should become a controlled manufacturing vocabulary:

- common cargo dimensions;
- repeated clamp/coupling standards;
- functional light codes;
- shared truss/pressure-vessel/radiator language;
- faction paint and local modifications;
- state variants that change function.

But each sector must compose the vocabulary differently:

- Ceres: ore transfer, worksite plant, ambush infrastructure and salvage hardware;
- Helios: clean freight, passenger, customs and repair infrastructure;
- Tethys: tanker, atmospheric, orbital catcher and high-heat infrastructure;
- lawless regions: improvised, stripped and concealed variants.

Modularity should make the universe coherent. Authored layout and activity should make sectors memorable.

---

## 5. No Man's Sky and EVE together — scale is not the benchmark

SpaceFace does not need:

- No Man's Sky's planetary scale;
- EVE's player economy;
- a continuously generated galaxy;
- thousands of simultaneous actors;
- a massive online service architecture.

It needs the parts of those games that support its own identity:

- controlled procedural/artistic variation;
- systemic activity that produces opportunities;
- clear ownership, crime and consequence;
- content visible through normal play;
- worlds that reward curiosity;
- modular production methods that retain sector identity.

The professional benchmark is therefore not “how much content exists?” It is:

> How many meaningful, visible and reusable relationships can the player understand and interfere with during one ordinary ten-minute visit?

---

## 6. Concrete consequences for the Ceres prompt

The space-game research reinforces six requirements already present in the revised implementation prompt:

1. **Authored macro, systemic micro:** keep the four Ceres pockets and use systems inside them.
2. **Visible economy:** make ore, cargo, routes and work legible before adding economic complexity.
3. **Diegetic opportunities:** the player sees situations before a mission tells them what to do.
4. **Clear criminal rules:** theft and aggression route through current ownership/heat/law systems.
5. **Controlled modular variation:** selectively re-author and combine donor assets; never bulk-promote them.
6. **Curated density:** primary activity occurs in camera-visible space and is reviewed as composition, not just simulated elsewhere.
