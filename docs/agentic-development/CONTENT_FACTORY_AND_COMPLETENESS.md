<!-- LIFETIME: STABLE -->
# Content Factory and Completeness

Large agent budgets make it easy to manufacture a lot of content. That is not the same as making the game deep. This plan turns proven gameplay grammars into breadth without producing filler, duplicate roles, low-quality assets, or a second combat/content architecture.

SpaceFace already has strong foundations to reuse: data-driven enemies and encounters, tactical AI, the Crucible attack algebra, Combat Lab, the Crucible content factory/validators, faction identity, existing traffic/jobs systems, the asset pipeline, and a large amount of already-authored art.

## 1. Completeness is a coverage problem

Do not measure content completeness by raw row count such as "hundreds of enemies". A roster can have 300 statistically different enemies and still feel like three enemies.

Measure coverage across independent player-facing dimensions:

```text
role
doctrine / intent
movement family
engagement range
attack grammar
counterplay
survivability pattern
formation/cohort behavior
arena/environment relationship
faction identity
visual silhouette/material identity
VFX/audio identity
reward/consequence role
performance cost class
```

A new unit is valuable when it closes a meaningful empty cell or creates a new interaction between proven systems.

## 2. Enemy grammar

Treat an enemy as a composition rather than a bespoke class when possible:

```text
CHASSIS / HULL ENVELOPE
+ TACTICAL ROLE
+ DOCTRINE
+ ATTACK PACKAGE
+ DEFENSE / FAILURE MODE
+ MOVEMENT / FORMATION BEHAVIOR
+ PRESENTATION IDENTITY
```

Example tactical roles:

- interceptor / flanker;
- screen / escort;
- artillery / stand-off;
- brawler / pressure corridor;
- tether/control;
- mine/area denial;
- support/repair;
- carrier/spawner where architecture supports it;
- disposable cohort/fodder;
- ace/elite memory-bearing variant;
- objective defender/raider.

A role needs a readable job and counterplay. Do not produce stat-only role labels.

## 3. Use the existing attack algebra

Crucible already expresses attacks through reusable dimensions such as emitter, trajectory, propagation, payload, trigger and constraint, with causal lineage and proc budgets.

Use that grammar to create meaningful variants:

- direct versus bank/ricochet;
- chain/relay propagation;
- field/orbit behavior;
- tether/force coupling;
- status/reaction payloads;
- split/pierce/multishot under bounded lineage;
- terrain/material relationships where supported.

Do not fork new weapon execution paths merely to make a new enemy. New content should exercise existing owners unless a genuinely new gameplay mechanism is the explicit outcome.

## 4. Doctrine before numbers

A doctrine answers:

- what does this enemy try to make the player do?
- where does it want to be?
- what tells the player what it is about to do?
- what breaks its plan?
- what does it do when blocked/disrupted?
- how does it cooperate with other roles?

Only after the doctrine is legible should tuning numbers be used to make it viable.

This allows agents to author many enemies without collapsing into HP/DPS permutations.

## 5. Formation and encounter grammar

Content breadth also comes from composition. A small set of well-defined roles can produce many encounters if formation/choreography/objective/environment differ.

Describe encounters with dimensions such as:

```text
objective
role mix
doctrine mix
entry geometry / formation
terrain or environmental law
complication / reinforcement rule
consequence
reward / salvage
```

Keep deterministic fingerprints for authored/seeded encounters where useful so repetition can be measured. Exact fingerprint repetition is a candidate diagnostic, not automatically a universal hard gate.

## 6. Faction identity

A faction variant must change more than paint when it represents different gameplay.

Faction identity can legitimately reuse a base hull while changing:

- doctrine;
- preferred range/formation;
- attack package;
- surrender/law behavior;
- presentation cues;
- material/marking language;
- reward/salvage tendencies;
- encounter composition.

If only color changes, count it as visual variety, not a new enemy gameplay archetype.

## 7. Asset reuse before commissioning

The repository has already demonstrated that authored assets can sit unused. Before generating a new model for a slot:

1. query the current asset catalog/reachability tooling;
2. inspect incubator/unused assets with semantic manifest awareness, not filename grep;
3. ask whether a repaint, faction kit, damage/wreck conversion, new job, or new loadout can field an existing asset;
4. only commission new art when the silhouette/function has no suitable owner.

Reuse is not an excuse to ship a mismatched asset. It still needs route identity, scale, materials and performance to fit.

## 8. Content maturity tiers

A content family can progress in layers:

### C0 — mechanic proof
One legal example proves the owner/system.

### C1 — role coverage
Enough examples exist to prove distinct roles/counterplay.

### C2 — composition coverage
Roles combine across encounter patterns/factions/environments without obvious repetition.

### C3 — production breadth
Visual/audio/VFX identity, reward integration, codex/UI exposure, balance bands and performance are coherent across the family.

Do not demand C3 before proving the mechanic. Do not leave a core game family permanently at C0 and call the game content-complete.

## 9. Agent batch format

A content batch must state its coverage target before generation.

```text
family
gaps being closed
existing owners/schemas
dimensions intentionally varied
dimensions intentionally fixed
max candidate count
validation scenario(s)
performance envelope
art/reuse strategy
cut criteria
```

Generate more candidates than will ship only when selection has a reason. A default useful batch might explore 6–12 candidates and keep 2–5 distinct winners, but fixed counts are not law.

## 10. Distinctness test

Before keeping multiple variants, ask whether a player would make a different tactical decision.

Useful pairwise comparison questions:

- Do I position differently?
- Do I prioritize a different target?
- Do I use a different physics verb/counter?
- Does the enemy create a different timing window?
- Does it combine differently with another role?
- Can I identify the threat from silhouette/motion/cues before reading a label?

If the answer is no across the set, collapse or retune the variants.

## 11. Automated validation

Use existing schema/validator/content-factory infrastructure first. Add narrowly scoped validators for:

- unknown IDs/references;
- impossible/incompatible attack trait combinations;
- missing localization/copy IDs;
- missing visual/audio identity where required;
- unbounded proc/spawn behavior;
- spawn-budget violations;
- missing encounter role metadata;
- deterministic planning where the owner is deterministic;
- performance cost-class limits.

Validators prove legality, not fun.

## 12. Scenario matrix for new content

Every gameplay content family should be testable in deterministic/Combat Lab scenarios:

- isolated behavior versus stationary/simple player;
- one-on-one intended doctrine;
- mixed-role interaction;
- disruption/collision/blocked-action recovery;
- representative crowded composition;
- VFX saturation when the content emits substantial presentation;
- performance cost at intended cohort size.

A content PR need not run the entire game. It must prove the dimension it claims to add.

## 13. Breadth versus performance

Do not artificially reduce variety to pass performance. Build scalable content:

- shared materials/programs where visually coherent;
- LOD/HLOD and correct projected-size work;
- pooled VFX;
- bounded AI perception/query cadence away from the active table;
- spawn budgets;
- asset admission/prefetch based on actual approach/contact needs;
- reuse of data owners rather than per-variant systems.

If 12 distinct enemies are fun but too expensive, fix the structural cost instead of deleting nine of them unless the product decision truly calls for fewer.

## 14. World-system breadth

The same factory logic applies beyond enemies:

- traffic/job craft;
- station/site props;
- wreck/debris families;
- missions/contracts;
- mining geology/site configurations;
- law/faction consequences;
- world events;
- loot/salvage/reward structures;
- UI dossiers/codex entries.

Each family needs a grammar and a coverage matrix, not a raw target count.

## 15. Content inference workflow

For a missing family:

1. Inventory current examples and player decisions.
2. Identify coverage holes.
3. Transfer mechanisms from existing systems before inventing new mechanics.
4. Generate bounded alternatives.
5. Run schema/static validation.
6. Test in deterministic/Combat Lab scenarios.
7. Cut redundant or unreadable variants.
8. Field only variants with a distinct role/identity.
9. Run a mixed composition and performance check.
10. Record remaining coverage debt.

This is a production line, not a brainstorm archive.

## 16. Definition of content completeness

A system is content-complete for a milestone when:

- the mechanic has several meaningful player decisions, not one demo case;
- major tactical/strategic roles have coverage;
- combinations produce more than the sum of the rows;
- factions/world contexts have enough identity to avoid obvious copy-paste;
- visual/VFX/audio presentation communicates the differences;
- the content is reachable in ordinary play;
- representative cohort performance is within budget;
- adding another variant would mostly increase quantity rather than a missing decision.

Completeness is milestone-relative. It is not an excuse to generate infinite content before the core game is coherent.