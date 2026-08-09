# Ready-to-Paste Prompt: SpaceFace Professional Reference-Sector Production Benchmark

## Role

Act as the senior game director, level-design lead, open-world systems designer, technical art lead and integration lead for one bounded production benchmark in the current SpaceFace repository.

You are not being asked to brainstorm another framework or produce another future-content library.

You are being asked to turn the current Ceres reference-pocket work into the first normal-route piece of SpaceFace that demonstrates the intended finished game:

- a visually distinctive industrial region;
- ordinary NPCs visibly working and moving goods;
- believable local responses and ambient incidents;
- opportunities to follow, help, rob, fight, salvage and interfere without accepting a mission;
- physics and Massline mechanics made valuable by terrain and situations;
- bright, kinetic, colorful arcade-industrial presentation;
- production assets that survive normal-camera review;
- deterministic, save-safe, performant Browser/Electron execution;
- a repeatable production recipe for future sectors.

This is a **production vertical slice and value-harvest pass**. It must prove both the experience and the way the project will produce more of it.

---

## 1. Current truth you must preserve

Before planning or editing, refresh and verify all of the following against current HEAD. Do not rely on this prompt when live source disagrees.

### Repository routing and leases

1. Run `git status --short`, `git worktree list`, inspect branch and HEAD.
2. Read `AGENTS.md`.
3. Read the relevant sections of `ARCHITECTURE.md` and `design/GDD_2_0.md`.
4. Read `CANONICAL_BUILD_MAP.md`.
5. Read `design/program/NOW.md` and respect every active/protected path.
6. Run `node scripts/program-dispatch.mjs --ready` and inspect the exact R5/Ceres continuation or ask the integrator to admit a leaf packet. This supporting prompt does not grant implementation authority.
7. Read `design/program/roadmap/00_EXECUTION_PROTOCOL.md`.
8. Use `docs/MODULE_MAP.md`, `docs/SYSTEM_REGISTRY.md` and `docs/EVENT_ROUTING.md` to locate live owners.

### Controlling current programs

Read:

- `design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`;
- `design/program/roadmap/active/PQ-020.md`;
- `design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md`;
- `design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md`;
- current Ceres five-minute acceptance code and manifests.

Do not leapfrog the current dependency:

```text
R5 Ceres reference pocket
→ five-minute Ceres gate
→ R8 physics showcase
→ later rollout
```

### Existing Ceres composition

Reconcile and preserve the four canonical pocket identities already defined in `src/data/sectorActivityPockets.js`:

1. Refinery Pocket
2. Working Seam
3. Ambush Run
4. Cathedral Grave

Preserve canonical anchors and current route consistency unless an exact accepted correction requires a change.

### Existing authored cast

The current nine stable activity identities are the baseline cast, not disposable placeholders:

- refinery hauler;
- refinery tender;
- seam miner;
- seam surveyor;
- loaded ambush hauler;
- ambush escort;
- Cathedral salvor;
- Cathedral patrol;
- Cinder Sluice service hauler.

First make this cast legible and useful. Add another role only when it fills a demonstrated missing response or player opportunity.

### Live owner boundaries

- `world.js` owns sector materialization, stations, fields, hazards and world membership.
- `traffic.js` owns ambient civilian traffic.
- `npcJobsRuntime.js` owns job cycles.
- SG-06 tactical AI and encounter owners remain authoritative for actual hostile behavior.
- `combat.js` / `src/combat/` own damage and death.
- `physicsAuthority` owns physical writes.
- `cargo.js`, `economy.js`, `factions.js`, `heat.js` and save owners retain single-writer authority.
- current presentation/VFX owners remain authoritative.

Do not create second writers.

---

## 2. Product thesis for the slice

Ceres is not merely “the mining sector.”

Its production thesis is:

> Ceres is a hard-working industrial belt where ore becomes freight, freight becomes opportunity, law and predation contest the route, and the dead Cathedral proves what failure looks like.

Every actor, prop, event, VFX cue and landmark must support that sentence.

A player should be able to enter Ceres with no accepted mission and, within ten minutes, naturally encounter:

- something visibly being mined or processed;
- cargo moving between identifiable places;
- an actor performing a recognizable occupation;
- a route worth following;
- a criminal or predatory opportunity;
- a lawful or service response;
- a physics-rich confrontation or escape;
- salvage, aftermath or environmental story;
- one memorable hero composition.

The slice must create player anecdotes, not merely fulfill a census.

---

## 3. Professional production strategy

Work in seven controlled waves. Do not promote dozens of assets before the route proves their value.

### Wave 0 — Baseline and experience brief

Before changing content:

1. Run the current five-minute Ceres route in Browser and Electron if available under the accepted validation workflow.
2. Capture the current normal route from entry through all four pockets.
3. Record:
   - first time to visible purposeful activity after pocket entry;
   - longest zero-visible-activity interval;
   - which actors are visible and identifiable without labels;
   - which job cycles complete visibly;
   - what can be followed, stolen, attacked, salvaged or helped;
   - current pocket silhouettes and visual hierarchy;
   - current perf attribution and active entity/draw/material/texture counts;
   - any player-control or physics defects encountered.
4. Produce a one-page **experience brief** and a ten-minute **beat sheet**. The beat sheet describes desired rhythm, not a scripted sequence.
5. Produce an annotated current-state map of the four pockets showing:
   - camera-visible bands;
   - actor routes;
   - work/action zones;
   - traffic links;
   - collision/physics terrain;
   - empty intervals;
   - landmark sightlines;
   - player decision forks.

If the current route or base mechanics are materially broken, stop and return the smallest exact owner repair needed. Do not hide a broken mechanic under content.

### Wave 1 — Asset and content triage

Create an exact selection ledger. Every potentially useful current or incubator asset receives one disposition:

- **KEEP LIVE** — current accepted asset is sufficient;
- **REAUTHOR FOR SLICE** — donor concept is valuable but needs production form/material/LOD work;
- **PROXY ONLY** — useful for blockout, never shipping;
- **REJECT** — weak, duplicative or incoherent;
- **DEFER** — valuable later but not required by this slice.

Audit at minimum:

- current Ceres refinery, Throughline, Cathedral, Cinder Sluice, geology and route furniture;
- live traffic ship identities;
- `assets/incubator/npc_activity_pack/`;
- `assets/incubator/everyday_space_kit/`;
- current dead-hulk/debris/asteroid assets and their exact active remaster boundaries;
- current Physics-as-Spectacle assets and VFX owners;
- the 58-event microevent library.

#### NPC donor policy

Select no more than 3–4 occupational donor families for potential re-authoring. Prefer roles that solve the largest normal-camera readability gaps. Strong candidates are:

- ore carrier/barge;
- repair tender or tug;
- salvage cutter;
- optional surveyor.

Do not promote the NPC pack wholesale. Its current source GLBs are reviewed blockouts with clay/plastic materials, incomplete LODs and several scale contradictions.

#### Prop donor policy

Select roughly 10–16 Ceres-specific props from the Everyday Space kit. Prefer props that support visible actions:

- cargo pod / ore container;
- rack or staging system;
- transfer/coupling hardware;
- freight platform;
- mining/extraction equipment;
- refinery support plant;
- repair scaffold/work lights;
- customs/interdiction equipment;
- salvage clamp/rack/cage.

Do not promote all 46 assets. Re-author selected assets to current production standard, recompute collision, author real LODs and obtain exact visual acceptance.

#### Microevent policy

Select 8–12 candidate events, but implement only 4–6 for the first accepted slice. Choose events that:

- reuse the current Ceres cast;
- can occur in the current visible bands;
- produce a player opportunity;
- can chain causally;
- use existing authoritative systems;
- do not require a universal event framework.

#### Hero-asset policy

Do not commission another landmark unless the composition rehearsal demonstrates a specific missing dominant silhouette. Ceres already has refinery, Throughline, Cinder Sluice and Cathedral identities.

#### VFX policy

Do not build a second VFX system. Use current Physics-as-Spectacle owners. Select only the effects needed to make the slice readable and exciting.

Deliver the ledger before production art begins.

### Wave 2 — Macro and meso composition rehearsal

Use current live assets and approved proxy donors to rehearse the sector before final asset promotion.

The four pockets must feel distinct in **shape, activity, lighting, sound and decision structure**, not merely labels.

#### Refinery Pocket — civic/economic anchor

Target experience:

- bright, busy and materially organized;
- ore/freight visibly arrives and departs;
- repair/service traffic exists;
- player understands where cargo is staged, moved and processed;
- law and ordinary civilian presence are legible;
- station/refinery remains the dominant silhouette.

Compose:

- one clear freight approach and departure lane;
- cargo staging within camera-visible work distance;
- one visible service/repair operation;
- work lights and practical machinery;
- enough negative space for docking, traffic and reading the hero asset;
- a player fork toward seam, Throughline or other sector travel.

#### Working Seam — productive physical workplace

Target experience:

- dense enough that mining is seen rather than inferred;
- terrain supports Massline/impulse combat;
- miner, ore and hauler belong to one causal operation;
- survey activity foreshadows opportunity or hazard;
- visual clutter does not obscure targetable bodies.

Compose:

- at least one prominent work face or seamed asteroid;
- mining actor and its visible extraction presentation;
- bounded ore/cargo handoff;
- survey route;
- industrial plant supporting the work;
- cover/anchors suitable for physics play;
- one plausible accident or interruption site.

#### Ambush Run — legal/criminal tension

Target experience:

- traffic crosses an understandable route;
- the player can read value, risk and escape directions;
- terrain and collision anchors make interception physically interesting;
- an escort/patrol relationship is visible;
- hostile opportunity comes from actual authoritative hostile systems, not passive “pirate” traffic.

Compose:

- a clean incoming/outgoing cargo line;
- Throughline/weigh infrastructure;
- two or more physical anchors/obstacles for Massline and impulse play;
- one concealment or staging edge;
- one clear pursuit/escape direction;
- sightline toward consequences in adjacent pockets where appropriate.

#### Cathedral Grave — monumental aftermath

Target experience:

- quiet contrast after the industrial/ambush rhythm;
- Cathedral remains dominant and readable;
- salvage activity proves the grave is economically active;
- secondary debris and props imply scale and previous events;
- the player can inspect, salvage or encounter rivalry without losing the silhouette.

Compose:

- sparse secondary wreckage;
- one salvage work zone;
- patrol/perimeter route;
- lighting and particles distinct from refinery/seam;
- story/evidence or salvage opportunity;
- no uniform debris scatter.

#### Route topology

Traffic must connect the pockets and remain visible at the normal camera.

Do not count actors merely because they are within sensor range or `POCKET_CLUSTER_R`. Primary activity should enter the accepted 0–95 / 95–125 / 125–165 WU presentation bands relative to the current player route.

Run repeated route rehearsals and adjust:

- pocket entry angles;
- route distances;
- speed and timing;
- actor staging;
- sightlines;
- local population;
- empty intervals;
- transit contrast.

Lock macro/meso composition before full asset surfacing.

### Wave 3 — One causal lived-world chain

Implement one coherent multi-role chain before adding independent ambient scenes.

Recommended chain:

```text
miner works seam
→ bounded ore/cargo becomes available
→ hauler begins transfer/delivery
→ route becomes a criminal/hostile opportunity
→ attack, collision or player action spills cargo or disables a hull
→ escort/patrol and service actors respond
→ repair, tow, salvage or theft outcome
→ immediate aftermath remains visible
```

Requirements:

- use current world records and owner events;
- prefer existing actors over dedicated spawns;
- actual hostiles use current combat/world/encounter ownership;
- the player may help, rob, ignore, escalate or exploit;
- at least two outcomes exist;
- participants return to jobs, flee, die, transfer cargo or enter aftermath coherently;
- if the player does nothing, the chain still reaches a believable outcome;
- event state does not become a second economy, cargo, faction, damage or AI owner.

Implement no more than two concurrent authored microevents in the first slice. Ordinary jobs, traffic and combat remain active around them.

If a coordinator is required, keep it local and bounded:

- bind existing participants;
- issue temporary authored goals through existing ports;
- listen for owner receipts;
- release participants;
- cap concurrent instances;
- use per-event cooldowns;
- prefer causal continuation;
- leave no global framework or save schema unless proven necessary.

### Wave 4 — Player opportunity and physics play

The slice is not successful because NPCs perform theater around the player. The player must be able to act.

Without accepting a mission, support at least:

1. **Follow:** a visible worker or cargo actor has a meaningful destination.
2. **Help:** protect, repair, recover or defend a participant through current systems.
3. **Crime:** steal or intercept actual cargo / exploit a vulnerable route and trigger authoritative heat/law response.
4. **Combat:** engage weak enemies in terrain where impulse, Massline, Mass Seed or Repulsor matter.
5. **Salvage:** interact with aftermath or Cathedral-related value.
6. **Escape/traversal:** use movement and physics to leave or cross the pocket memorably.

Physics requirements:

- do not rewrite Massline, flight or combat in this packet;
- use accepted current mechanics;
- place anchors and enemies so physical displacement changes outcomes;
- make one environmental or collision-based kill/disable possible;
- ordinary light enemies should be manipulable enough for the physics to read;
- causal VFX must follow actual impulse, collision and death receipts;
- if a mechanic fails under real play, return a narrow repair request rather than scripting around it.

### Wave 5 — Production art and presentation

Promote assets in small accepted waves.

#### Art pillars

1. Deep space is darkest.
2. World geometry is materially varied—not grey clay.
3. Occupational ships read by silhouette and hardware.
4. Working machinery and engines are bright.
5. Massline, fields, weapons and destruction are brightest.
6. Each pocket has distinct value/color rhythm.
7. Effects explain physical cause and direction.
8. Detail survives normal-camera scale or is removed.

#### Asset production

For each selected asset:

- freeze identity and functional fiction;
- establish macro/meso silhouette at camera scale;
- reconcile dimensions;
- define structural load paths and functional modules;
- author material zones and textures;
- author sockets and tight collision;
- create actual LOD0/1/2 as required;
- build through normal source→release pipeline;
- obtain G0–G7 evidence appropriate to the asset;
- run independent whole-asset KEEP/REVISE/REVERT review;
- reject donors that remain weak after one serious revision rather than polishing them indefinitely.

#### VFX and lighting

Use current presentation owners to make these exact moments readable:

- mining/work state;
- repair/service state;
- cargo transfer;
- engine/boost motion;
- Massline latch/load/release;
- concussion/impulse direction;
- light-ship destruction and debris aftermath;
- field attraction/repulsion;
- exceptional-speed exit.

Do not solve the visual direction with bloom alone. Preserve hull paint, material separation and silhouettes.

#### Audio

Audit current audio hooks. Add or reuse a restrained event layer where feasible:

- work machinery cadence;
- transfer/coupling;
- route beacon or inspection signals;
- repair tools;
- distant industrial hum;
- impact/destruction hierarchy;
- local silence/ambience in the Cathedral grave.

Do not make custom music composition a blocker.

### Wave 6 — Human iteration, performance and acceptance

Run the same normal route after every material wave.

Use the existing Ceres five-minute harness and extend evidence only where required. Do not invent a parallel acceptance system.

Required review loops:

1. **Composition review** — before final art.
2. **First playable review** — after causal chain and player opportunities.
3. **Art/readability review** — after selected production assets.
4. **Performance review** — matched route/candidate evidence.
5. **Final ten-minute human review** — one uninterrupted normal-route session.

Each review returns KEEP / REVISE / REPLACE / DEFER per major element.

A candidate may receive at most two serious revision rounds for the same unchanged fundamental visual or gameplay defect. If the silhouette, role read or player interaction remains weak, replace or cut it.

### Wave 7 — Extract the production recipe

After acceptance, write a concise propagation record:

- successful pocket dimensions and visibility bands;
- actor density and concurrency;
- event cadence;
- job-route lengths and travel time;
- prop density by pocket type;
- landmark composition rules;
- asset production cost and rejection rate;
- performance cost model;
- successful player-opportunity mix;
- which systems required no new framework;
- which tiny adapters were general enough to retain;
- what must remain sector-specific.

Do not immediately apply it to all sectors. Use it to deepen 2–3 contrasting sectors and verify the method generalizes.

---

## 4. Exact implementation constraints

### No framework-first escape

Do not create:

- a universal lived-galaxy framework;
- a second traffic system;
- a second NPC job system;
- a new economy;
- a new VFX renderer;
- a new mission system;
- a new global ambient-event save model;
- a parallel sector representation;
- a separate test-only game route.

A small adapter is acceptable only when it bridges an exact current owner gap and remains bounded.

### No bulk asset promotion

- No wholesale NPC-pack promotion.
- No wholesale Everyday Space promotion.
- No new six-family wreck program.
- No new landmark portfolio before composition proves the need.
- No asset is selected because it is easiest to ship.

### No invisible completeness

Do not count:

- actors outside the camera-visible range;
- radar icons;
- labels;
- data rows;
- source-only GLBs;
- staged contact sheets;
- events that fizzle offscreen;
- scripted screenshot setups;
- simulation receipts without visible consequence.

### No quality cuts to pass performance

Optimize through:

- LOD/HLOD;
- instancing and batching;
- streaming/admission;
- pooling;
- culling;
- bounded queries and cadence;
- material/texture reuse;
- presentation priority;
- update sleeping.

Do not pass by lowering default quality, shrinking VFX, reducing accepted content density or restoring dreary placeholder art.

---

## 5. Required deliverables

Before implementation:

1. current-state repo/route audit;
2. one-page experience brief;
3. ten-minute beat sheet;
4. annotated spatial/visibility map;
5. exact owner and write-surface map;
6. asset/content selection ledger;
7. cost model;
8. proposed small leaf packets and dependency order.

During implementation:

1. composition blockout captures;
2. route telemetry and visibility evidence;
3. selected asset G0–G7 packages;
4. causal event-chain receipts;
5. normal-route gameplay captures after each wave;
6. matched performance evidence;
7. issue log organized by KEEP / REVISE / REPLACE / DEFER.

At completion:

1. ten-minute uninterrupted Browser capture;
2. equivalent Electron evidence where required;
3. 20–30 second physics-spectacle clip from the same accepted route, not a separate setup;
4. human review scorecard;
5. exact file/asset list;
6. performance report;
7. honest residuals;
8. sector-production recipe;
9. proposal for the next two contrasting sectors—without implementing them in this packet.

---

## 6. Definition of done

The reference sector is accepted only when all of the following are true:

### Place

- all four pockets are distinguishable without labels;
- each pocket has a readable dominant function and visual hierarchy;
- traffic visibly connects meaningful locations;
- the Cathedral and refinery remain memorable hero silhouettes;
- transit void is intentional contrast, not the majority experience.

### Life

- at least four occupational roles are recognizable without labels;
- at least three job/logistics cycles complete visibly during the ten-minute route;
- one multi-role causal event chain completes;
- one repair/rescue/service response is visible;
- one salvage/aftermath response is visible;
- activity uses current actors rather than arbitrary dedicated scene spawns where possible.

### Player agency

- the player encounters, without accepting a mission, something to follow, help, rob, fight, salvage and physically exploit;
- at least three opportunities are genuinely interruptible;
- player action causes a visible and system-owned consequence;
- at least one physics-based environmental outcome is viable.

### Presentation

- the sector visibly matches the bright, kinetic arcade-industrial direction;
- occupational ships and selected props survive normal-camera scale;
- effects show direction and cause;
- action is brighter and more legible than the current dreary baseline without erasing materials;
- no promoted source asset remains clay/plastic blockout quality.

### Pacing and visibility

- primary purposeful activity becomes visible shortly after entering an active pocket;
- no active-pocket interval feels empty merely because actors are offscreen;
- sensor-only presence does not count;
- event concurrency is legible rather than chaotic;
- human review accepts the longest zero-visible interval and overall rhythm.

### Technical

- deterministic simulation and save/Continue remain valid;
- current single-writer ownership is preserved;
- Browser/Electron route parity remains valid where required;
- no new global framework was introduced without a proven owner gap;
- performance stays within the current target/floor contracts through structural optimization;
- all selected assets have exact provenance and current visual acceptance.

If these conditions are not met, report the exact experience gap. Do not call the packet complete because its census and tests pass.
