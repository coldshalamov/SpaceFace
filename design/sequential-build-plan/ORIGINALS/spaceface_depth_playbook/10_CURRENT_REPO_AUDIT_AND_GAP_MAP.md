# 10 — Current Repository Audit and Gap Map

## 1. Purpose and caution

This is a design-facing audit of the SpaceFace repository snapshots inspected while preparing this playbook. The tree is changing quickly, so it is not a substitute for checking current `master`, working-tree state, owner contracts, tests, and headed footage before editing.

Its purpose is to prevent two costly mistakes:

1. asking an agent to build a system that already exists in some form;
2. assuming a sophisticated system is a usable game mechanic merely because files and checks exist.

The central pattern is **semantic surplus, embodied deficit**. Many concepts already have data models, systems, tests, or design documents. The game often fails at the last translation step: physical form, input legibility, spatial composition, normal-route reachability, and persistent visible consequence.

## 2. Physics and collision

### What currently exists

The custom physics spine integrates ships in the XZ gameplay plane, performs circle/circle collision, sweeps ship motion against static asteroid/station circles, sweeps projectiles against entity circles, and emits impact events. An optional Rapier collision observer similarly creates one ball collider from each entity radius. The SG-02 dynamic-body authority supports dynamic bodies and attachments, including the massline.

### What this means in play

A visually complicated station may still be one collision circle. A wreck may still be one tiny radius. A ship can cross visible geometry that lies outside the radius, then collide with an invisible central core. Deliberate openings in the model cannot be physically meaningful because the collider has no topology.

This is not primarily an asset problem. Better models alone make the mismatch more obvious.

### Required next seam

Add **compound planar collision proxies** while retaining entity-level broad phase. Start with circles and capsules; add oriented boxes only if necessary. Support named sensor volumes separately from solid proxies. Author debug overlays and collision fixtures before converting content.

### What not to do

- Do not jump directly to arbitrary triangle-mesh collision.
- Do not give each mesh child an independent full entity unless interaction requires it.
- Do not solve docking by increasing station proximity radius.
- Do not allow art and collision definitions to drift silently.

## 3. Flight controls and auto-target path mode

### What currently exists

The input system contains pilot, helm-assist, and classic schemes. Pilot mode separates keyboard flight from mouse combat. Auto-target mode can acquire a hostile, control weapon lead, and record relative trackpad motion into world-space path points. The path follower chases sampled points using a world-space command, advances when it reaches or passes points, and brakes near the final point.

### Likely experiential failure

The current path follower is closer to waypoint chasing than gesture flight. It does not appear to establish a proper curvature-dependent speed profile, a stable look-ahead based on path arc length, or a target-relative combat slot. Mapping one desired world direction simultaneously into forward, lateral, and heading commands can make the ship feel as if translation and nose orientation disagree. Raw relative gesture accumulation and point sampling can also produce noisy or unintuitive routes.

### Decision

Treat the current G/path mode as an **experimental prototype**, not a protected game pillar. Do not keep piling special cases onto it.

Choose one of two clearer control experiments:

1. **Target-relative slot control:** trackpad X chooses bearing around locked target; Y chooses range.
2. **Command curve:** gesture becomes a smoothed path followed with pure pursuit and a curvature speed plan.

Prototype both in an isolated fixture if needed. Keep only the mode that a reviewer can understand without an explanation after a few attempts.

### Acceptance gap

A green input test does not prove good control feel. Require headed telemetry and repeatable route captures with visible command vectors, desired heading, desired velocity, path, look-ahead point, and actual trajectory.

## 4. Massline mechanics

### What currently exists

The repository contains a surprisingly broad massline program:

- tether-lock fire control;
- self-sling release assistance;
- payload throws toward cursor/selected targets;
- target-size solution tolerances;
- tumble states and impact consequences;
- bullet time;
- terrain-anchor spawning around encounters;
- jettison reaction mass;
- bomb propulsion;
- hitchhiking on faster neutral traffic;
- loot shards and related presentation.

The governing design states a clear intent vocabulary: `F` frees the player; RMB throws the tethered payload; LMB shoots.

### What is not proven

The same design audit reports that a bespoke live browser probe proved launch, physics readiness, latch, and reel shortening but did not complete the later LMB/RMB/loot/cloak/jettison sequence. Controlled reruns timed out. Therefore, many mechanics may be correct in isolated code/tests but are not yet a reliable player toy.

### Required next seam

Do not invent ten more massline verbs immediately. Build a **Massline Proving Ground** and make current verbs legible:

- explicit payload/self indicators;
- tension, line length, radial/tangential speed;
- release tangent and target solution;
- impact receipt;
- repeatable fixtures;
- Orbit Assist as the missing control-shaping layer.

### Likely highest-value addition

Orbit Assist is not another content feature. It is the control law that may make the existing physical vocabulary consistently usable. It should stabilize yaw/radial relationship under explicit intent while preserving real thrust and momentum.

### What to defer

- fleet-wide massline orders;
- arbitrary multi-tether webs;
- fully free telekinesis;
- long towing missions as a headline feature;
- additional assists before current ones are visible and testable.

## 5. Combat and weapons

### What currently exists

The weapon catalog already contains more than pure Galaga bullets:

- pulse lasers and autocannons;
- flak/point defense;
- beam weapons;
- railgun;
- plasma splash;
- missiles and torpedoes using `cmdty_munitions`;
- a siege lance;
- an EMP disruptor intended to damage subsystems rather than hull;
- unique salvage-only variants.

Most ordinary weapons use energy and/or heat. Broad ammunition management is not intrinsic to the whole arsenal.

### Why combat still reads as hold-LMB-until-dead

Weapon definitions can differ numerically while producing the same decision loop. Range, DPS, heat, and projectile speed are useful balancing dimensions but do not necessarily change the verb. Empty combat space also removes the value of displacement and terrain interaction.

### Required next seam

Build a small **force and field kernel**, then prototype weapons whose primary outputs are:

- impulse;
- directional placement;
- temporary control disruption;
- trajectory bending;
- rebound;
- deployable terrain;
- self-recoil.

Pair them with combat arenas containing large anchors, obstacles, hazards, and boundaries. A physics weapon in empty space is usually a temporary inconvenience followed by the enemy flying back.

### Munitions ruling

Keep ordinary weapons replenishment-free. Use manufactured munitions only for rare strategic ordnance: torpedoes, gravity pucks, vector mines, siege charges, or other deliberate high-impact tools. Replenish in useful batches through industry.

## 6. Wreck systems

### What currently exists

The unique-wreck catalog is semantically rich. It includes:

- multiple rumor channels;
- fuzzy bearings and scan gates;
- authored hazard contexts;
- unique weapon/module drops;
- legality and faction consequences;
- provenance from losses/incidents;
- complications and follow-up receipts;
- persistent state across rumor, fix, decision, and salvage phases.

Battle aftermath records also preserve victim, faction, zone, killer, encounter cause, class, and potential remedy.

### What reaches the player physically

Ordinary aftermath wrecks materialize as small generic wreck entities with a single radius, short salvage duration, and salvage pool. This can reduce an entire recorded battle to an asteroid-like object. The semantic identity may appear in labels or provenance text while the spatial operation remains the same.

### Required next seam

Do not rewrite the rumor/provenance system. It is valuable. Build a **physical embodiment adapter** capable of mapping selected authored wrecks or high-value aftermath records to:

- modular hull assemblies;
- compound collision proxies;
- targetable components;
- detachable payloads;
- persistent stripped/activated states;
- automated-salvage hooks.

Use generic small debris for low-value aftermath. Reserve monumental embodiment for authored or promoted losses. This preserves performance and rarity.

### First proof

The Wreck Cathedral should become the reference implementation. No procedural wreck generator is needed before it succeeds.

## 7. Asteroid Ops and industry

### What currently exists

The current Asteroid Ops vision is one of the strongest systems in the project. It has a coherent machine-design thesis:

- 28×45 drill field;
- irreversible contact-ring tradeoff;
- extraction versus preservation;
- Massline Core, extractor, gas tap, refinery, fabricator, cargo port;
- aggregate power/material networks;
- persistent anchored sites;
- courier pods;
- machine recipes and production;
- planned formation, thermal, signature, logistics, defense, and cluster layers;
- a north star in which asteroid clusters visibly assemble a station in flight space.

This is not merely a speculative idea; relevant machine/recipe data and site systems exist.

### Main risk

The industry layer can become an excellent internal game that pays out only credits or statistical efficiency. If so, it will deepen one screen while leaving the flight world unchanged.

### Required next seam

Implement an **exterior projection contract** from site state to flight state:

- Massline Core creates a visible exterior anchor/module;
- Cargo Port creates a physical port and storage/readout;
- couriers visibly launch when witnessed;
- shuttle/freighter tiers create moving jobs;
- transfer beams link asteroids;
- station frame appears in stages;
- site signature affects witnessed encounters and route risk;
- infrastructure unlocks travel, sensors, construction, or defense.

Every major internal milestone should produce an exterior change before the final station.

### Protect these laws

- contact ring remains irreversible;
- aggregates, not per-item belt simulation;
- output exits through engineered ports, not the mining laser;
- automation removes old attention demands and opens new design verbs;
- progression unlocks operations, not only rates.

## 8. Stations and destination UI

### What currently exists

Stations already route to a substantial shared shell: market, shipworks, industry, missions, factions, bar, repair, refuel, resupply, and undock. Splitting every station function into a new physical building and new UI would have poor return and create presentation debt.

### Correct direction

Keep complex transactions in the shared station interface. Differentiate destinations through:

- exterior geometry and docking;
- available services and stock;
- moving traffic/jobs;
- local laws and inspection behavior;
- adjacent industrial operations;
- visible construction/damage states;
- unique landmarks and route topology;
- concise station identity and ledger context.

A refinery can use the same industry screen while still being physically surrounded by ore traffic, storage tanks, transfer arms, and a working belt region.

### Required next seam

Docking truth and visible operations, not duplicated UIs.

## 9. Sectors, zones, and regional ecology

### What currently exists

The repository explicitly recognizes the “flat disc of unrelated dots” problem. It defines named zone types such as civilian cores, trade lanes, patrol corridors, mining belts, derelict fields, outlaw zones, radiation fields, nebulae, ambush lanes, and anomalies. Regional ecology classifies sectors into macro families and adjusts traffic, resources, law, danger, and encounter weights.

### Why sectors can still feel identical

The systems mostly provide metadata, labels, weights, and spawn biases. If physical objects remain clustered and NPCs share wandering behavior, the player sees little of the distinction. The current POI behavior families also reduce to a small set of existing verbs: dock, mine, salvage, scan, escort, kill.

### Required next seam

Convert authored zones into **activity pockets with routes and operations**:

- spatially separated pocket centers;
- pocket-specific landmark/dressing grammar;
- job routes between producers, checkpoints, stations, and ruins;
- one signature silhouette;
- at least one persistent state or consequence;
- omission rules so sectors do not all contain every pocket type.

Recompose one sector before scaling.

## 10. NPC activity and AI

### What currently exists

Traffic, encounters, regional ecology, faction presence, wingmen, patrol behaviors, and combat doctrines exist in various forms. Wingmen can materialize from the fleet ledger, but a mining order maps to a defensive/fleeing-trader archetype because there is no real mining AI in that path.

### Main mistake to avoid

Do not solve world life by making combat AI more elaborate. Most visible life can come from small job state machines:

- miner;
- hauler;
- patrol;
- scavenger;
- survey ship;
- rescue tug;
- construction tender;
- smuggler.

Each job has route anchors, visible work, a manifest or purpose, completion conditions, and an interruption policy. Combat remains a delegated interrupt.

### Required next seam

A generic **NPC job controller** separate from combat doctrine. It writes high-level destinations and intent into the existing movement/control ports. Add stuck detection and bounded recovery. Prove three jobs before adding more.

## 11. Story and presentation

### What currently exists

The repository has extensive worldbuilding, campaign logic, flavor channels, rumors, bars, comms, news, mission records, and a ship ledger. Image generation is available to the development agents, but character images have tended toward illustrated/cartoon pulp aesthetics.

### User preference and product fit

Long dialogue, response menus, mutually exclusive branches, and forced reading are poor fits. Blender cutscenes and autonomous audio production are also expensive and unreliable.

### Required next seam

Use a three-layer nonblocking story model:

1. **flight fragments:** one or two lines triggered by place/action;
2. **physical evidence:** model states, black boxes, decals, manifests, wreck geometry, traffic behavior;
3. **optional illustrated ledger:** beautiful static images, maps, diagrams, documents, and concise text available later.

Story threads should be additive. Actions alter context and world state but rarely delete whole arcs.

### Image-generation discipline

Prompt for production stills, documentary evidence, cinematic realism, material-specific lighting, restrained palettes, and in-world artifacts. Explicitly reject pulp illustration, comic ink, cel shading, retro-futurist magazine covers, exaggerated faces, and generic space opera costumes unless intentionally desired.

## 12. Progression and endgame

### Current opportunity

Asteroid industry provides a credible accumulation engine. The missing question is what accumulated capacity buys besides faster extraction and stronger guns.

### Progression outputs to prioritize

- new movement heads and assists;
- physics weapons/deployables;
- component tools;
- sensor and map infrastructure;
- courier/shuttle/freighter routes;
- gravity, acceleration, and wormhole infrastructure;
- automated salvage;
- construction capacity;
- station assembly;
- territorial security and traffic control;
- the ability to seed new sites/settlements.

### Endgame shape

No mandatory restart or branch-pruned campaign is required. Possible persistent endgames include:

- industrial network builder;
- salvage archaeologist;
- lawful route authority;
- pirate logistics predator;
- anomaly/infrastructure restorer;
- station and settlement constructor.

The galaxy should increasingly contain visible evidence of the player’s history.

## 13. Recommended keep, repair, defer, reject table

| Area | Ruling | Reason |
|---|---|---|
| Asteroid Ops contact-ring industry | **Protect and expand** | Strong compositional core and progression identity |
| Unique-wreck rumor/provenance data | **Keep** | Rich semantic foundation; needs embodiment |
| Massline throw/tumble/impulse suite | **Repair and prove** | High UVP potential; normal-route reliability/legibility incomplete |
| G/path auto-target mode | **Prototype or replace** | Current control mapping likely too ambiguous |
| Compound collision proxies | **Build now** | Unlocks physical landmarks, docking, ricochet, navigation |
| Component targeting/action recipes | **Build now** | Multiplies existing inputs into richer verbs |
| NPC job controller | **Build after primitives** | Makes world alive without combat-AI rewrite |
| Regional ecology metadata | **Keep, embody** | Useful weighting/identity but insufficient by itself |
| Shared station UI | **Keep** | Avoid duplicate UI debt; deepen exterior operations |
| Ordinary fuel | **Clarify/tune** | Jump resource, not boost energy; remove if it adds no route decision |
| Ordinary ammunition | **Avoid** | Use only for strategic ordnance |
| General crew/payroll | **Reject for now** | Administrative rather than embodied depth |
| Fleet expansion | **Defer** | Multiplies AI/navigation issues |
| Full cutscenes/voice/orchestral score | **Defer** | Production-heavy and weak autonomous capability |
| More generic POIs/sectors | **Stop scaling** | Multiplies sameness until operations improve |

## 14. The most important audit conclusion

The repository does not primarily need another broad design wave. It needs a disciplined sequence that converts existing ambition into player-operable physical truth:

```text
compound collision
→ component targeting
→ contextual action recipes
→ dynamic detachable payloads
→ reliable massline control/force verbs
→ one monumental embodied site
→ purposeful NPC jobs
→ one recomposed sector
→ exteriorized asteroid industry
→ content replication
```

Anything that skips several arrows should be treated skeptically. The game has already paid for many concepts in code and documents. The next payoff comes from making them impossible to miss on the screen and impossible to reduce to another glowing sphere.
