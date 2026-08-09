# Professional Production Research and SpaceFace Repository Audit

## Executive conclusion

The strongest professional approach is not a galaxy-wide content push and not a framework-first integration. It is a **production benchmark vertical slice**:

- authored enough to have a clear spatial and artistic thesis;
- systemic enough to produce unscripted opportunities;
- made through the actual shipping pipeline;
- dense enough to expose performance and readability problems;
- narrow enough to iterate repeatedly;
- accepted by human play and art review, not only automated checks;
- documented well enough to become the production recipe for later sectors.

Ceres is already structurally positioned to serve this purpose. The repo contains the topology, actors, jobs, acceptance route, performance history, hero landmarks, donor libraries and physics-presentation program. The next large chunk should not create the ingredients again. It should turn them into the first piece of SpaceFace that looks and behaves like the intended final game.

---

## 1. What major-game production practice suggests

### 1.1 A vertical slice proves both the game and the production method

Volition's GDC talk [“The Vertical Slice Challenge”](https://www.gdcvault.com/play/1022329/Inside-Unity-5-Engine-Architecture) describes the slice as a gate between preproduction and production: it should demonstrate that the team understands what it is making and how to make it.

**Application to SpaceFace:**

The Ceres slice should not merely prove that miners, props, microevents and VFX can be registered. It must prove:

- the player can perceive them at the normal camera;
- the systems interact;
- the art direction survives in motion;
- the content can be produced without violating ownership or performance;
- the team knows which donor assets are worth re-authoring;
- a second sector can be built by repeating a known process rather than improvising another mega-plan.

### 1.2 A lived world requires actors demonstrating life in front of the player

Hangar 13's [“Adding Life to Your Level”](https://gdcvault.com/play/1023551/Level-Design-Workshop-Adding-Life) distinguishes environmental evidence of past life from AI actors whose systemic behavior demonstrates life now.

Ubisoft's [Watch Dogs 2 crowd-AI talk](https://www.gdcvault.com/play/1024426/Helping-It-All-Emerge-Managing) emphasizes personality, reaction and unpredictability as generators of memorable unscripted anecdotes. Watch Dogs: Legion's [group behavior talk](https://www.gdcvault.com/play/1027239/AI-Summit-Branching-Out-Watch) shows that multi-actor scenes such as ID checks, extortions and police interactions become richer when participants understand group context.

**Application to SpaceFace:**

- Props and ships alone are insufficient.
- Ordinary job loops need visible work, transfer, interruption and response.
- At least one chain must involve multiple roles reacting to one causal event.
- The player needs opportunities to help, rob, follow, exploit or escalate without accepting a mission.
- “Pirate” traffic that remains neutral/passive is not a criminal encounter; actual hostiles must come from authoritative combat/world systems.

### 1.3 Authored macro structure and systemic micro behavior work better together

Professional open worlds rarely choose between completely scripted scenes and unconstrained simulation. They author the high-level shape and allow systems to fill it.

Examples:

- [Horizon Forbidden West's living-world process](https://www.gdcvault.com/play/1029117/Game-Narrative-Summit-Creating-a) tied culture, NPC development and world design together.
- [Horizon settlement design](https://www.gdcvault.com/play/1027747/Art-Direction-Summit-Designing-the) developed distinct faction and inhabitant identities from ideation through production.
- [Mario + Rabbids layered battles](https://gdcvault.com/play/1028810/Layered-Battles-Generating-Multiple-Qualitative) decomposed encounter production into reusable tagged layers while preserving specific battle intentions.
- [Watch Dogs: Legion Census](https://www.gdcvault.com/play/1027018/Census-The-Systemic-Backbone-Behind) shows the value—and cost—of consistent data integration, schedules and relationships.

**Application to SpaceFace:**

Use three composition layers:

1. **Macro** — sector silhouette, landmark hierarchy, route topology, pocket spacing, value/color rhythm and the sector's economic story.
2. **Meso** — worksite arrangements, role cast, job routes, law/crime opportunities, physics terrain and event chains.
3. **Micro** — props, cargo, lights, work VFX, debris, state variants, aftermath and tiny responses.

Ceres' four existing pockets are the macro foundation. The work is to make the meso and micro layers causally support that foundation.

### 1.4 Final or near-final assets must enter the playable loop early

Insomniac's [Sunset Overdrive procedural-production talk](https://www.gdcvault.com/play/1022216/Procedural-and-Automation-Techniques-for) and Volition's [Agents of Mayhem spline-modeling talk](https://www.gdcvault.com/play/1025244/Spline-Based-Procedural-Modeling-in) emphasize rapid environment iteration with playable final or near-final assets.

The lesson is not “procedural generation solves art.” It is that designers and artists need a short loop between layout, final presentation and play.

**Application to SpaceFace:**

- Begin with live-system graybox composition.
- Select production assets from that evidence.
- Promote them in small waves.
- Re-run the same route after every wave.
- Do not finish forty assets before seeing whether the pocket works.
- Do not spend days polishing a donor whose silhouette remains unreadable at 125 WU.

### 1.5 Art direction needs explicit pillars and district-specific composition

CD Projekt Red's [Building Night City](https://www.gdcvault.com/play/1027849/Art-Direction-Summit-Building-Night) describes clear art-direction pillars, handcrafted detail and close coordination between environment and other teams. The later [Dogtown talk](https://gdcvault.com/play/1034423/Art-Direction-Summit-Deciphering-Dogtown) traces a district from graybox to polished quality and explicitly revisits elements the team wanted to improve.

Sucker Punch's [Ghost of Tsushima art-direction discussion](https://gdcvault.com/play/1027473/Art-Direction-Summit-LIVE-Fireside) centers simplicity, color and light. Hello Games' [procedural-art talk](https://www.gdcvault.com/play/1021805/Art-Direction-Bootcamp-How-I) emphasizes retaining artistic control even in highly procedural worlds.

**Application to SpaceFace:**

The reference sector needs a small set of explicit art pillars:

- dark space is the canvas, not the entire palette;
- industrial structures use materially varied, readable zones;
- work and traffic are bright enough to read;
- force, weapons and destruction are the brightest phenomena;
- each pocket gets a different composition and emotional temperature;
- color and light guide the player's eye toward activity and opportunity;
- procedural reuse is controlled by authored pocket composition.

### 1.6 Detail comes after blockout, playtest and lock

Naughty Dog's [Museum Flashback production talk](https://gdcvault.com/play/1027683/Level-Design-Summit-Designing-the) describes a path from outline to 3D blockout, iteration, design lock, production involvement, playtesting and detail-oriented polish.

**Application to SpaceFace:**

Do not begin by surfacing every donor asset. First lock:

- what the player sees on approach;
- the paths traffic actually follows;
- how long it takes to reach activity;
- where combat/physics opportunities occur;
- where the player can choose to diverge;
- the visual hierarchy of each pocket.

Only then promote production art.

### 1.7 Physics spectacle should favor response and artistic control over literal realism

Sucker Punch's [Guiding Wind implementation talk](https://www.gdcvault.com/play/1027350/Blowing-from-the-West-Simulating) is a useful model: many systems reinforce one central mechanic, the result is believable and responsive, and the simulation is not required to be perfectly accurate.

Naughty Dog's [Melee AI talk](https://gdcvault.com/play/1027346/Melee-AI-in-The-Last) notes that close, skill-dependent mechanics amplify even small control or behavior defects.

**Application to SpaceFace:**

- The reference pocket must make Massline, impulse, fields and collision readable and responsive.
- Do not add physics complexity during the world-integration pass.
- Use existing accepted mechanics and expose their value through terrain, enemy composition, camera, VFX and causal consequences.
- If the base maneuver remains unpleasant, stop and route a focused gameplay repair instead of compensating with scripted spectacle.

### 1.8 Scalable quality comes from reusable standards, not indiscriminate reuse

Naughty Dog's [vehicle-pipeline talk](https://gdcvault.com/play/1027001/Driving-Innovation-A-New-Vehicle) describes improving quality and variation while making production faster and less memory-intensive. This is the relevant target for SpaceFace's occupational ships and environmental kits.

**Application to SpaceFace:**

- Reuse shared construction/material standards.
- Build role-specific silhouettes and equipment.
- Use trim/atlas/material-role systems where they preserve quality.
- Maintain shared cargo standards and sockets.
- Re-author the strongest donor concepts rather than shipping source blockouts.
- Track variation at the family and state level, not by duplicating whole assets blindly.

---

## 2. Current SpaceFace repository truth

### 2.1 Ceres is already the official reference-pocket dependency

The active Physics-as-Spectacle program defines the sequence:

```text
R0 Sandbox
→ R1 camera
→ R2/R3 Massline feel/acquisition
→ R4 physics combat
→ R5 Ceres reference pocket
→ five-minute Ceres gate
→ R8 kinetic showcase
→ five scene cells / asset waves / technical finish
```

R0, R1, R2 and R4 are recorded as accepted/published; R3 production is published; R5 and the five-minute Ceres gate remain open.

The new plan must strengthen and complete R5. It must not create an unrelated reference sector or leapfrog directly to R8.

### 2.2 Ceres already has four authored pockets

`src/data/sectorActivityPockets.js` defines:

- refinery pocket;
- working seam;
- ambush run;
- Cathedral grave.

It also defines accepted camera-local bands:

- 0–95 WU immediate;
- 95–125 WU moving;
- 125–165 WU speed-revealed;
- beyond that, approach/radar space.

The prompt should not ask an agent to invent a new four-area plan. It should ask the agent to make the current four areas read, function and connect.

### 2.3 The authored Ceres cast already exists

The stable cast is:

- refinery hauler;
- refinery tender;
- seam miner;
- seam surveyor;
- ambush loaded hauler;
- ambush escort;
- Cathedral salvor;
- Cathedral patrol;
- Cinder Sluice service hauler.

The current slice should first make these nine identities visible and meaningful. Additional NPC types should be admitted only where they create a missing player opportunity or response role.

### 2.4 Ceres already has a five-minute normal-route acceptance harness

The harness:

- uses fixed seed 47;
- runs 300 simulated seconds / 18,000 ticks;
- visits all four pockets through public inputs;
- measures camera-renderable activity;
- records zero-visible-activity intervals;
- deliberately leaves the qualitative threshold to human KEEP/REVISE review.

This is a strong foundation. The new plan should extend its evidence rather than invent a new test harness.

### 2.5 The current traffic system contains broad role vocabulary but generic identity

Current roles include:

- hauler;
- courier;
- miner;
- patrol;
- escort;
- smuggler;
- pirate;
- rescue;
- express;
- surveyor;
- salvor;
- tender.

But many roles reuse a small set of hulls. All ambient traffic is neutral/passive team 2; actual hostile encounters come from other owners. This makes role art and event choreography important, but it also means the reference slice must not mistake passive “pirate” traffic for a real criminal scene.

The current global traffic constants also contain a 420 WU pocket clustering radius, much larger than the 165 WU camera-visible reference band. For the reference slice, **sensor-local or sector-local is not enough**. Primary action must be composed within current camera-visible space.

### 2.6 The donor packs are not production assets

Both the NPC pack and Everyday Space kit are retained as donor/reference material with explicit REVISE-before-promotion boundaries. The implementation prompt must include an asset triage and re-authoring stage.

### 2.7 The microevent content breadth already exists

The project does not need another 50-event brainstorm. It needs a restrained first implementation, visible participant reuse and causal chains.

### 2.8 VFX and art direction already have an active owner

The active Physics-as-Spectacle program already defines the correct value hierarchy and current presentation seams. The reference-sector pass should use that owner, not establish a competing visual system.

---

## 3. The professional production model for Ceres

### Layer A — Experience thesis

In one sentence:

> Ceres is a hard-working industrial belt where ore becomes freight, freight becomes opportunity, law and predation contest the route, and the dead Cathedral proves what failure looks like.

This sentence should control content selection.

### Layer B — Ten-minute rhythm

The route needs alternating beats:

1. readable arrival and orientation;
2. visible ordinary work;
3. an economic transfer;
4. a choice to follow or divert;
5. a crime or hazard opportunity;
6. a physical confrontation or escape;
7. response and aftermath;
8. a quieter monumental reveal;
9. salvage or story evidence;
10. exit with a remembered consequence.

It should not be a scripted sequence. The beats define the expected density and opportunity rhythm; current actors and events fill them systemically.

### Layer C — Production waves

1. **Composition rehearsal:** live systems, current assets, proxy donors only.
2. **Asset triage:** KEEP / REAUTHOR / REJECT / DEFER ledger.
3. **First art wave:** only assets necessary for role and pocket readability.
4. **Systemic activity wave:** jobs, one event chain, real hostile opportunity, response.
5. **Spectacle wave:** current Massline/physics/VFX grammar in the same route.
6. **Polish wave:** lighting, audio, aftermath, state variants, UI restraint.
7. **Acceptance and recipe extraction.**

### Layer D — Propagation rule

Do not clone Ceres. Extract a method:

- one economic thesis;
- 3–5 activity pockets;
- one dominant landmark hierarchy;
- one or two visible job chains;
- one legal/criminal tension;
- one physical/traversal rule;
- one event chain;
- one aftermath/memory layer;
- controlled local density;
- a sector-specific material/light identity.

Then use that method to deepen only two or three additional sectors before further scale-out.
