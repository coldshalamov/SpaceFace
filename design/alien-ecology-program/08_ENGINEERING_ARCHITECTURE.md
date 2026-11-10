# 08 — Engineering Architecture

## Goal

Map the design onto SpaceFace's current runtime without creating an isolated "alien subsystem" that duplicates world, encounter, AI, VFX, salvage, or narrative machinery.

This is a design architecture, not authorization to edit every named file at once. Each implementation packet must re-read live code and the nearest AGENTS.md before mutation.

## 1. Existing seams to reuse

Current repo surfaces already suited to the program:

- src/data/sectorZones.js — named zones and zone-owned presence;
- src/systems/world.js — sector materialization, hazards, fields, persistent world entities;
- src/systems/encounterDirector.js — mystery-zone pacing and encounter scheduling;
- src/data/encounters/** — authored encounter shapes;
- src/systems/tacticalAI.js + src/ai/** — live AI stack;
- src/systems/aiPorts.js — execution bridge;
- src/systems/scanner.js — wreck/anomaly ping and player discovery;
- src/systems/sectorSim.js — coarse offscreen/day-scale simulation;
- src/systems/salvage.js or current salvage owner — contaminated salvage hooks;
- src/systems/cargo.js — sole cargo writer;
- src/systems/economy.js — sole credits writer;
- src/systems/factions.js — sole reputation writer;
- src/systems/story.js + src/data/narrative.js — story/revelation;
- src/render/visualFactory.js — world prop and structure rendering;
- src/render/vfx.js — pooled cosmetic effects;
- src/render/partsLibrary.js + authored asset pipeline — GLB routing;
- src/audio/** — field/creature/machine audio;
- local and galaxy map surfaces — discovered contamination information.

## 2. Phase-one architecture: derived contamination

Do not add a new registered system for the first slice.

Reason:
- PRODUCTION_UPDATE_ORDER is deliberately guarded;
- a mutable galaxy spread sim is not needed to prove the idea;
- a derived model is deterministic and cheap.

Recommended phase-one data module:
src/data/alienEcology.js

Responsibilities:
- contamination baselines by sector;
- site overrides;
- strain definitions;
- fauna definitions;
- environmental dressing profiles;
- pure helpers.

Example pure helper concepts:
- contaminationAt(state, sectorId, zoneId);
- alienStrainAt(sectorId, zoneId);
- ecologyEncounterWeights(...);
- scannerBiologyLabel(revelation, signature).

The helper may read story/revelation state but must not mutate it.

## 3. Persistent state

Phase one only needs persistent state for actual world consequences.

Potential storage:
state.world.alienEcology

Keep compact:
- revelation tier;
- site state overrides;
- resolved/changed ecological events;
- collected deep traces;
- protocol marks;
- optional local strain traits if adaptation is later added.

Avoid serializing cosmetic placements if they can be deterministically re-derived.

## 4. Single-writer law

Alien work must not violate existing owners.

Examples:
- a contaminated salvage event asks cargo to add/remove items;
- research payout asks economy to change credits;
- faction response asks factions to change rep;
- alien behavior requests force/impulse through physics authority;
- renderer never writes sim state.

If a dedicated ecology writer becomes necessary later, establish it explicitly and emit intents from other systems.

## 5. Encounter integration

Existing encounterDirector already distinguishes mystery zones such as derelict_field and anomaly_deep.

Additive integration path:
1. derive contamination for current zone;
2. if C below threshold, existing deck unchanged;
3. if eligible, mix ecology encounter candidates into mystery/ambient scheduling;
4. keep pressure costs and cooldowns in same director grammar;
5. encounter defines ecological situation rather than only faction squad.

Do not spawn ecology independently in a second director.

## 6. Fauna entity model

Fauna can initially reuse core entity/physics representation with a distinct semantic tag.

Suggested data:
- entity.kind = fauna or equivalent existing extensible category;
- ecologySpeciesId;
- strainId;
- driveState;
- relayAffinity;
- contaminationRole;
- noncombat/hostility context.

Movement:
- use physics authority;
- drive layer produces desired force/turn;
- simple procedural behaviors.

Do not route simple grazers through the full tactical combat stack unless reuse is truly cheaper and behavior still reads nonhuman.

## 7. Field coherence

A local coherence calculation can be cheap.

Inputs:
- nearby relay entities;
- species relayAffinity;
- local C;
- distance;
- suppression fields.

Outputs:
- alert sharing radius;
- target-interest bias;
- formation/heading correlation;
- reaction latency.

No all-to-all graph every frame.

Implementation options:
- spatial hash query;
- zone-level cached field strength;
- one relay broadcasts a scalar/target hint;
- lower-frequency updates for distant fauna.

Performance requirement:
field cost should scale with nearby relevant entities, not total galaxy entity count.

## 8. Host memory traits

Represent as data, not ML.

Species/strain runtime can query a few scalar priors.

Example:
memory: {
  reactorAttraction: 0.8,
  beamAversion: 0.2,
  precursorSuppressionFear: 1.0
}

If dynamic learning is later admitted:
- update at coarse event boundaries;
- clamp;
- persist only the small vector;
- deterministic cause ledger.

## 9. Infestation rendering

Recommended structure:
- authored infestation modules in normal asset pipeline;
- visualFactory or a focused render helper composes them onto site anchors;
- seed = stable site/entity identity;
- cosmetic microfilaments can be material/shader;
- hero growth uses real geometry.

No Math.random in sim-derived placement.

Rendering can use cosmetic RNG only where identity does not need persistence.

## 10. Asset contract

Use existing authored GLB process.

New asset families:
- fungus modules;
- fauna whole-body assets;
- precursor robot assets;
- precursor structure modules.

Avoid adding a parallel asset loader.

Every player-facing model must:
- pass manifest/release process;
- be reachable in default release-asset mode;
- have deliberate LOD strategy if repeatedly spawned;
- be reviewed at gameplay camera.

## 11. Animation strategy

Phase one avoids full skinned-character infrastructure.

Preferred motion:
- rigid-body articulated segments;
- vertex/shader deformation;
- procedural membrane wave;
- root transform plus child appendages;
- VFX-supported motion.

Only introduce skeletal animation if a later creature requires it and the content value justifies a new engine responsibility.

## 12. Scanner integration

Scanner should emit existing event patterns and annotate contacts/sites.

Needed concepts:
- biology signature;
- contamination state;
- relay signature;
- host/fungal separation;
- unknown -> identified terminology based on R.

Do not create a separate alien scanner screen before proving existing scan flow cannot carry the information.

## 13. Salvage and cargo

Contaminated salvage needs metadata.

Possible item flags:
- contaminationClass;
- custodySeal;
- sterile;
- active.

Cargo system remains sole writer.

Stations can query cargo flags to:
- allow;
- refuse;
- route to quarantine;
- impose fee;
- expose special buyer.

## 14. Economy

Use existing market/events where possible.

New commodities should be few at first:
- one industrial biological material;
- one research sample class;
- filter consumables.

Avoid flooding commodity registry with twenty alien drops before prices and uses exist.

## 15. Story/revelation

Revelation is a small progression state.

Sources:
- specific scans;
- recovered records;
- story beats;
- precursor protocol observations.

Presentation should change terminology rather than pop a giant lore tree.

## 16. Precursor machine implementation

Reuse faction metadata for technical integration where helpful, but do not expose ordinary rep language.

Potential runtime identity:
faction_verge_layers stays.

Add machine-specific protocol state separately.

AI:
- behavior templates based on directive;
- combat authority only under protocol violation;
- disable/control tools rather than generic weapons.

## 17. Map integration

At low R:
- unknown biological hazard marker;
- isolated site only.

At higher R:
- contamination confidence;
- strain family;
- predicted migration;
- precursor exclusion zone.

Do not reveal whole-sector omniscience from one scan.

## 18. Performance architecture

Alien ecology creates three main risks:

### Entity count
Mitigate with:
- ecological LOD;
- aggregate distant swarms;
- low-frequency drive updates;
- non-targetable cosmetic microfauna.

### Transparency/overdraw
Mitigate with:
- bounded spore volume;
- geometry where cheaper;
- screen-space density caps based on measured cost;
- no full-sector fog blanket.

### First-use hitch
Mitigate with:
- precompile materials;
- preload deep-sector assets before transition;
- reuse material families;
- no surprise texture upload mid-combat.

Add representative performance scenarios before scaling:
- alien_colony_steady;
- alien_swarm_active;
- infestation_vfx_burst;
- precursor_wake_transition.

## 19. Determinism

All gameplay-relevant ecology:
- seeded;
- state.rng or passed deterministic RNG;
- state.simTime;
- save-stable IDs.

No wall clock.
No Math.random in sim.

Cosmetic shader noise may remain nondeterministic only if it cannot affect gameplay or evidence.

## 20. Testing surfaces

Unit/pure data:
- contamination band;
- strain lookup;
- encounter eligibility;
- scanner terminology.

Behavior:
- relay on/off changes coordination but does not kill fauna;
- passive fauna do not fire/aggro without trigger;
- suppression field reduces coherence;
- site state persists after save/load.

World:
- same seed rematerializes same infestation anchors;
- contamination does not appear in C0 starter zone;
- deep site is reachable.

Performance:
- new scenarios count entities/draws/material admission;
- no per-frame allocation explosion.

Narrative:
- R unlocks terminology but does not change physical C.

## 21. Content scaling law

Build one reusable primitive whenever three planned pieces of content need the same behavior.

Examples:
- if three organisms attach to hulls, build attachment grammar;
- if three sites need relay fields, build relay primitive;
- if three machine encounters need protocol prompts, build protocol grammar.

Do not generalize before the third concrete use.

## 22. Acceptance

Architecture succeeds when:
- first vertical slice requires no duplicate world/encounter framework;
- ordinary human content remains unchanged in C0 sectors;
- ecology is deterministic;
- save/load preserves consequential state;
- high visual density is not proportional to high CPU entity count;
- future creatures/sites can mostly be added through data + authored assets.
