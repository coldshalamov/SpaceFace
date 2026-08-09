# Audit of the Earlier Low-Interference Prompts

## Executive finding

The earlier prompts were useful as **preproduction vocabulary-generation tasks**, but the reference-sector prompt treated their outputs as if they were finished production libraries. The current repository disproves that assumption.

The right response is not to discard the work. It is to classify it correctly:

- **concept / donor vocabulary** — useful ideas and source geometry;
- **production candidate** — re-authored, textured, LODed and technically complete;
- **runtime accepted** — normal-route, performance and art-review accepted;
- **composition accepted** — demonstrably improves the actual reference sector.

The prior prompts mostly produced the first category. The next chunk must promote only the minimum set required to prove the game.

---

## Prompt 1 — Lived-World NPC Visual & Activity Pack

### What it produced

The repository now contains `assets/incubator/npc_activity_pack/` with:

- 15 source GLBs across twelve occupational families and variants;
- socket/collision/scale records;
- role and activity-state documents;
- contact sheets and distance views;
- integration instructions mapping selected roles onto existing `traffic` and `npcJobsRuntime` seams.

### What was good

The pack identified the correct missing visual vocabulary:

- ore baskets;
- pressure-vessel cradles;
- tug push frames;
- sensor spines;
- repair racks;
- rescue bays;
- customs hardware;
- construction trusses.

This is exactly the kind of occupational specificity that can make NPCs readable without labels.

### What the independent review found

The pack is explicitly **source-only design-candidate donor material**. It is not runtime-ready.

The strongest silhouettes are the ore barge, tankers, sweeper, tug and construction rig. But the review also reports:

- primitive boxes, tubes and spheres dominate;
- materials read as clay or plastic;
- multiple families converge toward similar box-hull silhouettes at real camera distance;
- some occupational reads depend on labels, lamps or staged props;
- no production textures, animations or authored LOD GLBs exist;
- nominal fiction dimensions disagree with several measured envelopes.

### Corrected use

Do **not** promote the whole pack.

For Ceres, select no more than three or four donor families whose roles materially improve the ten-minute slice. Recommended first candidates:

1. one ore/industrial carrier or barge identity;
2. one repair tender or tug identity;
3. one salvage cutter identity;
4. optionally one surveyor if it remains distinguishable at the accepted camera scale.

Each selected family must be re-authored under the current visual-asset production standard, reconciled to scale, provided with real material zones and LODs, promoted independently, and accepted through the live route. If a current accepted ship already communicates the role adequately, keep it and spend the art budget elsewhere.

### What not to do

- Do not add twelve new `TRAFFIC_ROLES` merely because twelve concept families exist.
- Do not bind all source GLBs directly into `partsLibrary`.
- Do not use color swaps as occupational identity.
- Do not count role labels as readability.
- Do not let occupational art work block the initial composition blockout.

---

## Prompt 2 — Everyday Space Infrastructure & Prop Library

### What it produced

The repository now contains `assets/incubator/everyday_space_kit/` with approximately 46 source GLBs across cargo, mining, service, law, civic and salvage families, including state variants.

It also contains:

- six composition boards;
- machine-readable instance lists;
- placement grammar;
- socket and collision recommendations;
- size, role and LOD plans;
- an existing-coverage audit that deliberately avoids duplicating current beacons, buoys, billboards and lane markers.

### What was good

The coverage audit correctly identified a real repository gap: major stations and sites exist, but **fixed mid-scale industrial plant** is sparse. The kit's best value is not individual props; it is the possibility of making a refinery, mining seam, customs lane, repair yard or salvage grave read as a functioning workplace.

It also introduced a valuable shared manufacturing language: standard cargo dimensions, functional light codes, repeated yard construction and sockets for actual activity.

### What the review found

The kit is also **source-only donor material requiring revision**.

Known issues include:

- flat or placeholder surfacing;
- incomplete LOD production;
- loose conservative collision bounds, badly overstated on some assets;
- one crusher with a capped feed that contradicts its function;
- contact sheets and composition boards that are useful references but not route-bound production evidence;
- no runtime manifests or sector integration.

### Corrected use

Use the six composition boards as a **graybox and layout vocabulary**, not as a bulk-runtime package.

For the first Ceres pass, select roughly 10–16 props total, clustered by function rather than scattered uniformly. A strong first selection might include:

- standard cargo pod and ore container;
- one container rack;
- transfer arm or coupling station;
- freight platform;
- extraction mast or drill platform;
- one processing/refinery support element;
- one radiator/power utility;
- repair scaffold or work-light tower;
- customs scanner/transponder element for the ambush route;
- salvage clamp, hull rack or scrap cage for the Cathedral grave.

Re-author and promote only those exact assets. Reuse them in multiple combinations so the universe looks manufactured, while keeping each pocket's composition distinct.

### What not to do

- Do not promote 46 props in one packet.
- Do not use the kit to hide weak macro composition with clutter.
- Do not uniformly scatter “detail” across empty space.
- Do not create static prop density that has no relationship to NPC activity.
- Do not duplicate existing accepted route furniture.

---

## Prompt 3 — Wreck & Aftermath Ecology Pack

### What happened

No clearly complete standalone six-family wreck incubator matching the prompt was found on current master.

Meanwhile, the repository already has active or accepted work around:

- Wreck Cathedral;
- `place_dead_hulk`;
- `place_debris_chunk`;
- aftermath wreck systems;
- salvage actions;
- source/release remaster handoffs and acceptance gates.

### Corrected use

Do not start a new six-family wreck program as part of the reference-sector chunk.

Ceres already has a hero wreck, a grave shard, a bait wreck, live aftermath logic and salvage actors. The slice should first prove that these existing systems can create a coherent graveyard and visible aftermath.

At most, add one bounded secondary wreck/debris family if the blockout demonstrates a specific missing silhouette or gameplay function. Otherwise, defer the broader wreck ecology until after the reference slice establishes:

- normal-camera wreck scale;
- collision and traversal needs;
- salvage socket language;
- frequency and density of ordinary aftermath;
- acceptable performance cost.

### What not to do

- Do not collide with the current Cathedral or hulk/debris exact paths.
- Do not treat an extra wreck catalog as depth.
- Do not create more glowing salvage blobs.

---

## Prompt 4 — Microevent & Ambient Choreography Library

### What it produced

The repository now contains 58 ambient event definitions across eight categories. Fifty-three are classified as runnable against current or near-current systems, and five are explicitly blocked on future mechanics.

The library includes useful event chains such as:

- rich seam → crowding → collision → disabled ship → recovery or theft;
- patrol inspection → smuggler breakaway → pursuit or dumped cargo;
- fresh battlefield → salvage convergence → crime or law response;
- construction delivery → visible build progress.

### What was good

The content breadth is sufficient. The library itself correctly concludes that repetition is not the main risk; **concurrency, gating, visibility and participant reuse** are the real risks.

Its strongest production advice is:

- target 2–3 concurrent events in a busy region;
- apply per-event cooldowns;
- prefer events using actors already present;
- continue causal chains when possible;
- avoid spawning invisible events that fizzle offscreen.

### What needs correction

The integration document proposes a general choreography runner owning `state.ambientEvents`. That may eventually be useful, but creating a universal runner before proving local event choreography risks another framework-first implementation.

### Corrected use

For the reference sector:

- choose 8–12 candidate events from the library;
- implement only 4–6 in the first accepted slice;
- prefer events involving the already-authored Ceres cast;
- allow no more than two concurrent authored microevents at first, alongside ordinary jobs and hostile encounters;
- use existing `traffic`, `npcJobsRuntime`, `encounterDirector`, faction/law, aftermath and world-record owners;
- introduce a minimal local coordinator only where no current owner can schedule the necessary participant handoff;
- do not persist a new global ambient-event universe unless the slice demonstrates that persistence is needed.

The first event chain should be one coherent local story, not six disconnected random scenes.

Recommended chain:

1. seam miner produces a bounded load;
2. refinery hauler collects or begins a delivery;
3. ambush opportunity or pirate shadowing threatens the route;
4. cargo spills or a ship becomes disabled;
5. escort/patrol, repair tender and/or salvor respond;
6. player intervention changes the outcome;
7. immediate aftermath remains visible.

### What not to do

- Do not import all 58 events into runtime.
- Do not write a universal “Living Galaxy Framework” before Ceres works.
- Do not spawn dedicated actors when an appropriate live actor is available.
- Do not count events that happen outside the camera-visible area.

---

## Prompt 5 — VFX Next Reference Library

### Current repo reality

No separate VFX Next incubator pack needs to be integrated. The repository already has a current `PHYSICS_AS_SPECTACLE_PROGRAM.md`, a Physics-as-Spectacle art bible, cause-aware destruction receipts, priority-aware VFX admission, velocity language, Massline presentation foundations, field presentation and an explicit R5 → five-minute Ceres gate → R8 showcase dependency.

### Corrected use

Do not build or import a parallel VFX architecture.

The Ceres integration chunk should use current presentation owners and apply a **small, coherent effect grammar** to real gameplay moments:

- bright working machinery and engines;
- mining and repair activity;
- Massline latch/load/release;
- concussion impact and directional displacement;
- light-ship destruction and persistent debris;
- Mass Seed / Repulsor field response;
- exceptional-speed exit.

The initial effect work should remain subordinate to causal gameplay and the existing R8 program. If the slice exposes a missing effect, add one bounded presentation consumer rather than a new library.

---

## Prompt 6 — Hero Landmark & Sector-Identity Asset Pack

### Current repo reality

Ceres already contains or references several strong landmark candidates:

- the accepted/reworked Ceres refinery;
- Wreck Cathedral;
- Throughline weigh beacon / ambush lane;
- Cinder Sluice machinery;
- asteroid fields and collision anchors.

The repository also has several active graphics/remaster lanes and exact-path production rules.

### Corrected use

Do not make 6–8 new hero landmarks before the reference sector proves how large, bright, interactive and expensive a landmark should be.

Ceres should first demonstrate that the existing hero assets can form a memorable spatial hierarchy:

- refinery as civic/economic anchor;
- working seam as busy production space;
- Throughline as a tense route/interdiction space;
- Cathedral as the off-lane mystery/graveyard.

Only if one pocket lacks a dominant silhouette after blockout and rehearsal should a new hero asset be admitted.

---

## Audit of the Earlier Integration Prompt

The earlier “Reference Sector Integration / Value-Harvest Pass” had the correct instinct—compose the packs into one actual sector—but it was still too broad.

### What it got right

- Ceres is the correct proving ground.
- Four distinct pockets are appropriate.
- Traffic must connect them.
- Events must be interruptible.
- normal-route footage, not asset viewers, is the acceptance surface.
- the work should be mostly composition and integration, not another abstraction.

### What it got wrong or left ambiguous

1. **It assumed the four-pocket composition still needed to be invented.** The current repo already has those pocket identities, activity slots, object slots, camera bands and route acceptance.
2. **It implied bulk consumption of all packs.** Both asset packs explicitly require selection and re-authoring.
3. **It asked for 12–18 microevents immediately.** That is too many before the scheduling, visibility and interruption model is proven.
4. **It treated VFX Next as a separate pack.** Current Physics-as-Spectacle work already owns that domain.
5. **It did not distinguish blockout, production promotion and composition acceptance.** AAA-quality work requires separate gates.
6. **It lacked an asset-selection ledger.** Without one, agents can promote whichever assets are easiest rather than those with the highest player-facing value.
7. **It lacked a beat sheet and composition rehearsal.** A sector can satisfy role counts while remaining rhythmically empty.
8. **It did not explicitly require a causal local story.** A lived world is more convincing when activities produce responses and aftermath.
9. **It did not include a replace-or-kill rule for weak assets.** Agents can spend endless time polishing a bad donor.
10. **It did not extract a repeatable production recipe after acceptance.** The slice must teach the project how to make the rest of the game.

The revised prompt closes these gaps.
