# 09 — Vertical Slice: The Charon Bloom

## Purpose

Prove the complete alien-ecology thesis with one bounded location before scaling the content program.

The slice must answer four questions:

1. Does the alien ecology feel materially different from human combat/faction content?
2. Can the current engine express it without a new parallel framework?
3. Can modular infestation assets make an existing location feel authored and transformed?
4. Does the player want to know what happened here after the encounter ends?

If the slice fails any of those, fix the grammar before adding content.

## 1. Why Charon Expanse

Charon is the preferred first site because:
- existing faction_understory points at Charon;
- the region already supports frontier, salvage, mining, and ambush logic;
- it is far enough from the clean core for overt biology to be plausible;
- it is not so late that the first proof is inaccessible;
- it lets the program reinterpret existing work rather than discard it.

## 2. Site

Working name: The Cinder Nursery.

Type:
derelict_field or anomaly_deep, whichever best matches live director semantics after implementation audit.

Backstory:
A DMC service barge died near an old wreck cluster. Its reactor failed safe rather than catastrophically. Residual heat, trapped volatiles, and metal-rich debris created a stable habitat. Something already present in the field colonized the barge and spread through nearby wreckage.

Concord classification:
UNDERSTORY EVENT / BIOLOGICAL — NONSTANDARD / LOCALIZED.

This is the first time the player can reasonably infer that "Understory" is a filing category rather than a government.

## 3. Physical composition

The site contains:

### Hero object
One existing derelict/barge transformed with modular infestation.

Required infestation modules:
- filament sheet;
- nerve bundle;
- cyst cluster;
- one large relay node;
- membrane patch;
- mineral root.

### Static ecology
- three to five non-targetable growth clusters;
- one dormant spore chimney;
- one calcified resource patch.

### Fauna
- 4–8 Needle Swarm visual agents, aggregated if needed;
- 2 Veil-Ray-like grazers or a Charon-specific equivalent;
- 1 Blind Shepherd relay animal;
- optional 1 Hull Leech encounter.

### Human trace
- old DMC service beacon;
- sealed cargo canister;
- one failed quarantine clamp or improvised warning buoy.

The player should read "human workplace became habitat."

## 4. Arrival beat

At long range:
- ordinary derelict signature;
- mild scanner irregularity;
- no combat music;
- fauna barely visible.

At medium range:
- scanner returns several contacts that do not classify cleanly;
- two contacts change heading simultaneously;
- visual growth becomes obvious.

At close range:
- relay pulse occurs;
- all infected fauna orient briefly toward the ship;
- then resume different roles.

This synchronized turn is the first key uncanny beat.

## 5. Player objective

Initial mission:
Recover a DMC black box or sealed data recorder from the wreck.

This is intentionally mundane.

The alien ecology complicates an ordinary salvage job rather than arriving as a separate quest universe.

## 6. Interaction sequence

### Step A — scan

Player can scan:
- barge;
- growth;
- fauna;
- relay.

Early terminology:
UNKNOWN ORGANIC FILM
ACTIVE METABOLISM
SIGNAL CORRELATION DETECTED

### Step B — approach

Fauna react to:
- reactor heat;
- active scanner;
- proximity.

No automatic hostility.

### Step C — restore power

The black box requires temporary local power.

Restoring power:
- increases heat;
- wakes cyst activity;
- attracts one larger organism or changes existing fauna behavior;
- raises local field coherence because surviving electronics provide useful electromagnetic structure.

This makes human action causally responsible for escalation.

### Step D — choose handling

Player can:
- rush extraction;
- cut power;
- use lure;
- destroy relay;
- tow wreck section;
- kill fauna.

Each works but changes aftermath.

### Step E — recover black box

Black box contains mostly ordinary maintenance data.

One line matters:
the crew logged "conductive mold" before failure and continued operation because shutdown would miss quota.

Human institutional negligence stays present.

## 7. Relay mechanic

The Blind Shepherd or equivalent acts as local coherence amplifier.

With relay active:
- fauna share alert state;
- synchronized heading;
- larger interest radius.

With relay disrupted:
- individuals use personal perception;
- swarm coordination drops;
- some panic;
- some flee;
- predator risk can increase.

This proves:
disruption is not a universal off switch.

## 8. Hull Leech event

Optional:
One leech attaches if player remains hot/stationary near wreck.

Effects:
- mild energy/heat penalty;
- visible physical attachment;
- clear removal options.

Removal:
- purge ring if unlocked;
- sharp acceleration;
- scrape/impact risk;
- return to station;
- directed utility pulse if provided by mission.

This proves alien biology can affect the player's ship without adding a second health bar.

## 9. Reward

Baseline:
- credits from DMC;
- black-box mission completion.

Discovery reward:
- scanner taxonomy unlock: FILAMENTOUS CONTAMINATION;
- first contaminated salvage item;
- one research contact/message;
- Charon map gets one localized biological marker.

Optional skill reward:
recover relay sample intact.

No alien gun.

## 10. Persistent aftermath

Outcome flags:

### Careful extraction
Site remains ecologically stable.
Future:
non-hostile observation encounter possible.

### Relay destroyed
Site becomes low-coherence.
Future:
fewer coordinated encounters, more chaotic individual fauna.

### Carrier/cysts ruptured
Site contamination locally increases.
Future:
spore-field variant.

### Site burned
Human route safer.
Future:
research faction loses opportunity; DMC likes outcome.

The state differences can initially be tiny. Persistence itself is the proof.

## 11. Art deliverables

Minimum:
- 6 high-quality infestation modules;
- 1 hero relay organism;
- 1 fauna body family with variant material/scale;
- 1 hull-leech model;
- 1 spore VFX recipe;
- 1 field pulse cue;
- 1 contaminated material set.

No full bestiary.

## 12. Audio deliverables

- low contamination ambience;
- relay pulse;
- cyst movement;
- fauna call;
- hull attachment;
- scan discovery cue.

No new music track required.

## 13. UI deliverables

Minimal:
- scanner labels;
- one contamination status indicator in existing target/scan presentation;
- mission copy;
- optional quarantine tag on recovered salvage.

Do not redesign the HUD for the slice.

## 14. Engineering deliverables

- alienEcology data module;
- contamination lookup;
- one zone/site integration;
- one fauna drive implementation;
- one relay-coherence primitive;
- one attachment interaction or simulated equivalent;
- infestation visual composition;
- save-state aftermath flag;
- scanner terminology unlock.

## 15. Tests

Required:
- C0 sectors unchanged;
- site contamination deterministic;
- fauna passive until stimulus;
- relay changes coordination;
- save/load preserves aftermath;
- scanner label changes after revelation;
- same site seed places same hero infestation anchors;
- no direct credit/cargo writes outside owners.

## 16. Performance proof

New scenario:
alien_charon_slice.

Measure:
- entity count;
- sim p95 ratio vs comparable derelict field;
- draw/material count;
- transparent VFX load;
- first-use program/asset admission;
- no post-arrival asset upload hitch.

Acceptance:
the slice is not allowed to establish a pattern that requires quality reduction later.

## 17. Player-facing acceptance

A successful blind test should produce observations roughly like:
- "I wasn't sure if those things were enemies."
- "They all looked at me at the same time."
- "Turning the wreck on changed the ecosystem."
- "The fungus looked like it grew through the wreck, not like decals."
- "I want to know what the Understory actually is."

Bad reactions:
- "It's just Zerg."
- "It's a new enemy faction."
- "I killed the hive thing and everything turned off."
- "It's just a green fog biome."
- "Why did the story unlock aliens everywhere?"

## 18. Exit gate

Do not begin mass content production until:
- the site is reachable;
- it looks and behaves distinctively;
- the ecological interaction is fun without relying on lore text;
- performance is acceptable;
- the infestation kit proves reuse;
- the player understands at least one behavior through play.

Only then multiply.
