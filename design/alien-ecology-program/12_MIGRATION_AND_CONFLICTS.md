# 12 — Migration and Existing-Content Conflicts

## Purpose

The repo already contains partial implementations and planned material that overlap this program. This file prevents future agents from solving those collisions independently and producing contradictory worlds.

This document proposes migration intent only. Implementation must re-audit current master when admitted.

## 1. Understory

Current implementation:
- faction_understory exists;
- personality: saprophyte;
- fleetClass: xenomorphic;
- Charon home sector;
- graveyard salvage behavior;
- loss-ledger-only hull roles;
- spore bloom on death;
- an external salvage encounter;
- Depth planning includes parasite attachment meshes and Mycelia linkage.

Conflict:
As a distinct fungal/xenomorphic polity, Understory duplicates the now-preferred Vethari-linked fungal ecology.

Migration:
Retain the technical ID where useful, but change ontology.

Preferred player-facing interpretation:
"Understory" is a Concord/spacer category for colonized wreck ecologies and their re-flown hulls.

Preserve:
- Charon association;
- wreck colonization;
- spore bloom;
- loss-ledger-only hull sourcing;
- visual parasite attachment concept;
- post-battle scavenging;
- xenomorphic presentation.

Reconsider:
- ordinary diplomacy;
- ordinary commodity buying;
- "faction" framing in UI;
- any suggestion of a sovereign capital, political government, or separate fungal origin.

Possible technical policy:
Keep faction_understory as encounter/IFF/content-routing namespace even if player-facing UI says BIOLOGICAL / UNDERSTORY rather than FACTION.

## 2. Mycelia

Current plan:
an infested world tied to Understory origin.

Conflict:
Would imply separate fungal origin/civilization.

Migration:
Mycelia becomes a major Vethari-linked outbreak/ecology world.

Preserve:
- night-side branching network visual;
- terminator-dependent scan;
- "dead by day, alive by night" mechanic;
- Understory content connection.

Change:
- not origin of separate species;
- not necessarily fungus homeworld;
- evidence of host diversity and long-term colonization.

Potential story:
Mycelia is where humans first realize a planet-scale network can emerge without any single giant brain.

## 3. Vael

Current worldbuilding canon:
Vael are human.

Current runtime metadata:
fleetClass: alien.

Conflict:
Mechanical naming undermines the setting's "actual aliens are unknown/hidden" structure and can confuse agents.

Migration:
Change fleetClass when safe to a human doctrine/class that preserves their distinct behavior.

Possible new class:
- vael;
- contractual;
- remnant;
- specialist.

Do not remove:
- xenophobic personality if it still serves behavior;
- exotic visual identity;
- page-nine contamination clause;
- far-rim territory.

Use contradiction productively:
The player may initially call the Vael "alien" socially, then discover actual non-human life.

## 4. Vethari

Current canon:
- cosmic horror backbone;
- protected off-frame law;
- fungal shared field;
- Wren history;
- REF 44-C.

New program:
expands visible consequences dramatically.

Potential conflict:
If ecology becomes common, it can accidentally make Vethari ordinary.

Guardrail:
Separate "Vethari-linked" from "Vethari present."

Visible fauna and colonies do not mean a Vethari is nearby.

A region can carry ancient contamination for centuries.

Vethari direct evidence remains rare.

## 5. Fungus mechanism

Current canon includes:
- filamentary organism;
- neural coupling;
- electromagnetic field;
- grief cycles;
- transmissibility to humans.

New additions:
- broader host range;
- lossy memory;
- developmental mutation;
- horizontal gene-transfer-like mechanism;
- ecological strain variation.

Migration rule:
These additions must be phrased as extension, not rewrite.

Do not contradict:
- field is involuntary;
- human neural effects are limited/slow;
- Vethari catastrophe is neurological;
- fungus itself is not a plotting supervillain.

## 6. Verge-Layers

Current implementation:
- faction_verge_layers;
- precursor fleetClass;
- gate-network control;
- Surveyor Prism;
- Revocation Lattice;
- Gate Auditor;
- disable-not-destroy behavior;
- progressive waking as gates close.

Compatibility:
Extremely high.

Migration:
Reframe them as machine institutions left by mythic creators.

Preserve IDs and role names where possible.

Improve player-facing language:
- protocol status instead of rep;
- transit authority instead of territory;
- directive behavior instead of faction personality.

## 7. Other precursor candidates

Depth brainstorming contains multiple ancient/hidden civilizations.

Risk:
Too many ancients destroy scale by making every mystery a different precursor faction.

Rule:
Before admitting a new precursor civilization, ask whether it can instead be:
- a creator myth;
- a machine class;
- a misidentified structure;
- a historical phase of the same unknown creators;
- a human interpretation of Verge-Layer evidence.

One legendary creator layer is stronger than five competing "ancient god races."

## 8. Fulfillment and machine factions

Existing Fulfillment concept is bureaucratic/feral logistics AI.

Do not merge Fulfillment into precursor machines.

Reason:
Fulfillment is human/corporate-system horror.
Verge-Layers are deep-time nonhuman machine institutions.

Their contrast is valuable.

Fulfillment:
badly inherited human objective.

Verge-Layer:
alien/ancient directive whose assumptions predate human categories.

## 9. Ascendant Choir

Choir relics may predate human settlement and may or may not be Vethari/precursor.

Preserve ambiguity.

Useful migration:
some relics can be:
- precursor fragments;
- sterile fungal mineralization;
- human artifacts misdated;
- unrelated.

Do not retroactively make every Choir belief correct.

## 10. REF 44-C

This is a major bridge.

Existing strength:
same bureaucracy handles inconvenient evidence.

New use:
REF 44-C can become the human institutional bucket for:
- fungal samples;
- contaminated wrecks;
- biological irregularities;
- precursor quarantine evidence when inconvenient.

Do not make REF 44-C an omniscient secret-agency project.
Its horror is administrative inertia.

## 11. Sector identity

Do not repaint every outer sector as alien.

Migration strategy:
- preserve current human landmarks;
- add contamination pockets;
- deepen selected mystery zones;
- use new deep sectors for maximal transformation.

Existing region identities should remain legible under infection.

Example:
DMC refinery contaminated still reads as DMC industrial history plus ecology, not generic alien biome.

## 12. Enemy archetypes

Do not convert fauna into src/data/enemies.js roster by default.

Use enemy archetypes only when an organism truly participates in ordinary combat rules.

Otherwise:
- fauna entity;
- hazard;
- ambient life;
- encounter object.

This prevents "alien = red radar dot."

## 13. Faction system

If technical faction IDs are reused for readability:
- do not expose conventional rep tiers where conceptually wrong;
- maintain scanner hostility as behavior/context, not species identity;
- avoid kill-rep incentives for wildlife.

A player should not grind reputation with the fungus.

## 14. Economy

Existing Understory "buys wreckage" may be retained indirectly.

Options:
- human broker buys for Understory research;
- automated exchange at contaminated site;
- Quiet middleman;
- DMC reclamation bounty;
- colonized wreck consumes debris physically and can exchange behaviorally without "commerce."

Pick one that does not imply the fungus runs a store.

## 15. Assets

Existing planned parasite attachment meshes are valuable.

Migration:
use them as modular infestation kit.

Do not make one attachment set per faction hull unless visual quality requires it.
Prefer reusable socket/placement grammar.

Existing standard hulls can become infected wreck hosts without claiming the fungus manufactures ships.

## 16. Story pacing

Current Vethari story is deliberately skippable/subordinate to human Thread A.

Alien-ecology expansion risks hijacking the campaign.

Rule:
Core human story remains playable if player does minimal alien investigation.

The alien arc can:
- deepen Wren;
- open late routes;
- provide optional/postgame depth;
- intersect the main story at selected beats.

It should not turn every contract into fungus exposition.

## 17. Terminology

Reserve:
Vethari — species.
fungus — underlying organism/phenomenon.
Understory — human classification/ecology label.
strain — local lineage/ecological expression.
host — infected organism.
relay — organism/tissue increasing field coherence.
deep trace — high-fidelity network memory.
Verge-Layers — machine institution/remnant.
creators — unknown precursor makers, name unresolved.

Avoid:
hive queen;
Overmind;
Zerg-like;
infection faction;
alien plague as universal shorthand.

## 18. Migration order

1. Ratify canon direction.
2. Inventory references.
3. Patch player-facing contradictions first.
4. Keep technical IDs stable where they save work.
5. Build vertical slice.
6. Only then rewrite broad Depth plans/asset queues to match.
7. Add checks to prevent old assumptions from returning.

## 19. What not to delete

Preserve valuable existing work even when ontology changes:
- Understory IDs and salvage hooks;
- parasite/growth asset plans;
- Mycelia visual mechanic;
- Verge-Layer roles;
- Vael page-nine quarantine language;
- Vethari protected prose;
- REF 44-C chain;
- existing zone/encounter infrastructure.

The program is a synthesis, not a purge.

## 20. Final consistency test

After migration, ask:

Can a new agent explain the world in five sentences without contradiction?

Target answer:

Humanity believes intelligent alien life is absent or mythical. The Vethari are an ancient advanced species broken by a fungus that forces nervous systems into a destructive shared field, and the species itself remains almost entirely off-frame. The same fungus has colonized other life and wreck ecologies, producing the phenomena humans call the Understory. Deeper space contains surviving machines and structures of a legendary precursor civilization, represented by the Verge-Layers, whose old protocols appear to have contained or routed around similar biology. As the player travels outward, those two hidden histories become increasingly physical until human space looks like a recent layer laid over something much older.
