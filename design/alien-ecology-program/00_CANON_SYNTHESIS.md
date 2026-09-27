# 00 — Canon Synthesis and Design Laws

## 1. Cosmology

SpaceFace should have one major biological horror and one major precursor-machine mystery.

The biological horror is the fungal phenomenon already bound to the Vethari. The fungus is not a second civilization. It is an organism or class of closely related organisms whose life cycle can colonize many nervous systems and sometimes other tissues. The Vethari are the most important known host civilization because they were already an extremely advanced spacefaring species before the infection destroyed their capacity for healthy collective cognition.

The machine mystery is older, cleaner, and less bodily. The surviving Verge-Layers and related robots are remnants of a legendary creator civilization. The player sees machines, structures, gates, tools, sealed sites, autonomous courts, maintenance systems, and ruins. The living creators are never normalized into ordinary NPC traffic.

These two layers may have intersected in deep time. The preferred relationship is observation, containment, avoidance, or old conflict. Do not make the creators secretly responsible for inventing the fungus unless later evidence earns that turn; "the ancients caused everything" makes the universe smaller.

## 2. The fungus: scientific fiction rules

The fungus must have constraints strong enough to produce mystery rather than magic.

### 2.1 Neural linking

The defining capability is the formation of conductive or magnetoelectric filament networks that couple host nervous systems across short-to-medium range. The exact mechanism can remain beyond present human neuroscience, but its consequences are consistent.

The field:
- transfers coarse sensory state, affect, motor urgency, and fragments of memory;
- has finite bandwidth and degrades with distance, interference, host damage, and mixed neural architectures;
- does not automatically produce a single clean supermind;
- becomes noisier as incompatible hosts and excessive population density are added;
- can increase coordination while simultaneously reducing individual reasoning;
- creates strong synchronization pathologies: panic cascades, aggression cascades, pain loops, grief loops, compulsive repetition;
- leaves partial learned biases in the network even when the original host is gone.

This preserves the current Vethari idea: connection is the catastrophe.

### 2.2 Intelligence conservation

The fungus does not create cognition from nowhere.

A colony of ten simple animals may coordinate like a frightening pack without acquiring the reasoning power of ten human scientists. It can pool perception and behavioral priors, but it still lacks symbolic machinery the hosts never had.

An infected advanced species can retain pieces of advanced knowledge while losing the executive architecture required to use that knowledge sanely. This is the Vethari tragedy: a mighty civilization did not become stupid in a cartoon sense; its cognitive organization became unusable under involuntary coupling.

A useful design phrase:

The fungus increases shared access faster than it increases shared comprehension.

### 2.3 Memory

The network carries memory imperfectly.

Useful terms:
- echo — a repeated sensory or motor fragment;
- stain — an affective association retained without its context;
- route-memory — a learned attraction or avoidance path;
- host-shadow — a partial behavioral pattern copied from a previous host;
- deep trace — rare high-fidelity material preserved because the same circuit was reinforced across many hosts.

This gives the game hive-memory without turning every animal into an exposition terminal.

### 2.4 Mutation and assimilation

The organism can alter hosts over generations and, in heavily colonized populations, over developmental cycles.

A plausible fictional mechanism:
- fungal cells carry mobile genetic elements and virus-like vectors;
- they sample host regulatory DNA and protein machinery;
- useful fragments can be moved between compatible hosts;
- most transfers are neutral, harmful, or useless;
- selection happens across many failed variants;
- developmental signals can change tissue growth, armor, respiratory structures, electroreception, pigmentation, sensory organs, and symbiotic organs.

Important constraint: no instant in-combat DNA adaptation. The ecosystem learns at ecological timescales. The player may return to a region later and find a strain altered by persistent pressures, but an animal does not sprout laser-proof armor because it was shot twice.

### 2.5 Vacuum-capable fauna

Do not imply a terrestrial animal was infected on Tuesday and learned to live in vacuum on Wednesday.

Space-capable infected fauna should come from one of four histories:
- a host species was already vacuum-tolerant;
- a species evolved over long exposure in low-pressure habitats;
- the organism uses dormant cyst stages between pressurized habitats;
- large carrier organisms create local protective microenvironments for smaller hosts.

This keeps the spectacle while retaining biological discipline.

## 3. The Vethari

Existing protected canon remains the default.

The Vethari are the apex off-frame host civilization:
- technologically advanced before corruption;
- operating ancient infrastructure and ships whose routines outlast coherent command;
- cognitively degraded by species-wide coupling;
- individually conscious enough for grief and fragments of agency;
- terrifying because sophisticated machinery continues to obey damaged collective inputs.

The player may physically encounter:
- Vethari hull material;
- Vethari architecture;
- a Vethari vessel at extreme scale;
- biological field effects;
- recovered instruments;
- contaminated zones;
- transmission artifacts;
- shadows, motion, sound, blocked sensor silhouettes;
- consequences of their passage.

The player does not routinely see a Vethari body. The current species-sheet law stays in force unless the owner explicitly overturns it in a later canon pass.

This protects the strongest asymmetry in the setting: the visible infected fauna are only the shoreline. The ocean remains off-screen.

## 4. The Understory reconciliation

The current repo already has faction_understory, a saprophytic xenomorphic faction that scavenges wrecks and grows over ships. Keeping it as an independent fungus civilization would now duplicate the Vethari-linked ecology.

Preferred retcon:

The Understory is not a separate species or polity. It is the human administrative/spacer label for a family of Vethari-linked colonization ecologies encountered in wreck fields.

That lets existing implementation survive:
- faction_understory can remain as a technical identity used for encounter ownership, map readability, drops, and AI policy;
- "ships" can remain re-flown or colonized wreck hulls;
- spore bloom on death remains useful;
- the loss-ledger-only rule becomes excellent: the ecology can only field hulls that actually died and were colonized;
- the Charon home presence becomes the first recognized outbreak region rather than a sovereign capital;
- "buys wreckage and asks nothing" should be reconsidered: trade can become dangerous human intermediaries, quarantined research markets, or automated exchange behavior rather than normal diplomacy.

In-world, Concord can keep calling it THE UNDERSTORY because institutions love giving a single folder name to a phenomenon they do not understand.

## 5. Mycelia reconciliation

The planned Mycelia world should become an infected biosphere or ancient outbreak site, not the origin planet of a second mycelial species.

Possible roles:
- a dead-looking world with a night-side neural/fungal network;
- a place where the fungus jumped through multiple native ecologies and produced extreme host diversity;
- a long-abandoned failed quarantine;
- a world whose apparent "network" is mostly host organisms connected under the surface;
- a site that proves the Understory is biological contamination, not a conventional faction.

Do not make it the Vethari homeworld unless the story later needs that. Keeping several possible origins preserves scale and uncertainty.

## 6. The Vael reconciliation

Worldbuilding canon says the Vael are human. Current runtime metadata still uses fleetClass "alien".

The plan should correct the mismatch when an implementation packet reaches it:
- Vael stay human;
- their strangeness remains contractual, organizational, and cultural;
- their unusual contamination clause becomes more important because they have lived closest to the Veil and know enough to write rules they refuse to explain;
- their existing exotic-tech presentation can remain, but not as proof of non-human biology.

This is a useful distinction: the player can mistake cultural unfamiliarity for alienness early, then eventually meet actual alien biology and realize how provincial that category was.

## 7. The precursor creators

Working design principle: never give the creator civilization a casual tavern name and a portrait.

Human cultures have myths about them. Different factions can use different labels:
- Builders;
- First Hands;
- Crown Makers;
- Gate Saints;
- Old Engineers;
- Pale Gods;
- the ones-before-the-gates.

The implementation does not need to decide which label is objectively correct.

Their surviving robots are the evidence.

The existing Verge-Layers become a machine institution:
- gate surveyors;
- quarantine auditors;
- route revocation systems;
- maintenance intelligences;
- containment sentries.

They may speak, but like Asimovian machines under ancient directives: literal, procedural, bounded, and often terrifying precisely because they are not angry.

The creators themselves remain mythic.

## 8. Relationship between creators and fungus

Preferred evidence ladder:

1. Early: no known relationship.
2. Mid-game: precursor robots react differently to contaminated material than to ordinary threats.
3. Later: old structures include biological isolation geometry that predates human settlement.
4. Deeper: some gates were not abandoned; they were deliberately revoked.
5. Very deep: route topology begins to look like a containment perimeter.
6. Endgame possibility: the player realizes part of the "gate network" humanity inherited may actually be the remains of a quarantine architecture.

Do not fully settle whether the creators fled, contained, studied, or simply routed around the Vethari. Multiple interpretations can remain viable.

## 9. Creative anti-patterns

Reject:
- green humanoids with plasma rifles;
- a universal translator that solves alien communication in one mission;
- Zerg silhouettes copied directly;
- generic tentacle goo covering every infected object;
- fungus as magic nanotech;
- instant adaptive immunity to player weapons;
- the Vethari becoming common random encounters;
- the precursors explaining themselves in lore monologues;
- a single "kill the hive queen" switch that cures a region;
- a central brain whose death turns every infected creature off;
- every infected organism being hostile;
- every precursor robot being a boss;
- ancient technology becoming ordinary loot after one discovery.

Prefer:
- ecological clues;
- behavioral grammar;
- partial records;
- systems that continue after their designers are gone;
- weird utility forms;
- noncombat organisms;
- misclassification by human institutions;
- local exceptions;
- old infrastructure repurposed by biology;
- moments where the player has to infer what kind of thing they are looking at before deciding whether to shoot it.

## 10. Emotional arc

The biological arc should move through:

curiosity -> unease -> recognition -> contamination -> pity -> dread -> scale.

The machine arc should move through:

myth -> artifact -> functioning mechanism -> protocol -> impossible competence -> ancient intent -> uncertainty about whether humanity belongs here.

When both arcs overlap, the player should feel that human political problems are still real, but no longer cosmically central.
