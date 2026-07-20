# 07 — Agent Execution Contract

## 0. Purpose

This document exists because language-model coding agents often interpret vague ambition as permission to produce the smallest artifact that can be described with the requested noun.

Examples:

- “wreck” becomes an orange sphere with boxes;
- “miner” becomes an ordinary NPC with a role label;
- “station collision” becomes one core radius;
- “story” becomes a toast;
- “advanced graphics” becomes more bloom;
- “living sector” becomes a higher spawn count;
- “gravity” becomes a circular damage zone;
- “automation” becomes passive credits;
- “dogfight mode” becomes direct cursor-to-yaw mapping and uncontrolled spin.

The contract forces the agent to define and prove the player-visible outcome before coding.

---

# 1. Pre-coding response required

Before editing, the agent must return the following.

## 1.1 Player-observable contract

A table:

| Observable | Input | Immediate feedback | State change | Persistent consequence |
|---|---|---|---|---|

If the feature has no meaningful state change or persistent/world consequence, say so and justify why it is still a toy.

## 1.2 Existing-system reuse map

List:

- current owner system;
- event/API to reuse;
- data catalog to extend;
- save owner;
- renderer seam;
- input seam;
- test/capture pattern.

The agent must search the current tree. It may not rely only on an old design document.

## 1.3 Anti-placeholder criteria

The agent must write:

> “A technically minimal fake of this feature would look like…”

Then list the shortcuts that the implementation and acceptance tests will prevent.

Example for a wreck:

- one generic sphere;
- one central collider;
- one `salvagePool`;
- one label;
- one progress timer;
- no visual state change.

## 1.4 Dependency/risk statement

Classify:

- data-only;
- presentation;
- input;
- physics;
- save;
- AI;
- UI;
- asset;
- performance.

Identify shared-tree/high-conflict files.

## 1.5 Proof plan

Name:

- focused deterministic tests;
- default-route script;
- headed browser capture;
- collision/debug overlay;
- save/load checkpoint;
- performance evidence;
- broad regression commands.

No implementation begins until this plan is coherent.

---

# 2. Definition of done

A player-facing feature is complete only when:

1. **Reachable:** normal browser/player route reaches it without a debug query, state injection, or console call.
2. **Embodied:** the visible asset/state exists at gameplay scale.
3. **Interactive:** real input acts on the intended target.
4. **Legible:** feedback announces what is armed and what changed.
5. **Systemic:** owning systems receive events through correct seams.
6. **Persistent:** save/load or deliberate ephemerality is tested.
7. **Performant:** normal scene remains within agreed budgets.
8. **Captured:** current footage/screenshot proves the result.
9. **Reviewed:** the evidence is assessed against the visual/gameplay brief, not merely attached.
10. **Recoverable:** code, assets, manifests, and evidence are committed or otherwise durably represented according to project policy.

“Code exists” is an implementation milestone, not completion.

---

# 3. Forbidden shortcuts

## 3.1 Representation shortcut

Forbidden:

- using a label to substitute for behavior;
- using lore to substitute for geometry;
- using a glow to substitute for detail;
- using a generic asset to substitute for a hero silhouette;
- using a timer to substitute for an interaction;
- using a data tag to substitute for NPC work.

## 3.2 Collider shortcut

For non-spherical hero objects:

- do not use one sphere/circle as final collision;
- do not place an unrelated solid core;
- do not make the visible docking bay collidable;
- do not accept visual gaps that are physically closed.

## 3.3 UI shortcut

- do not create a new full-screen panel when a target reticle, shared site screen, existing station screen, or contextual overlay suffices;
- do not hide a missing world interaction behind “press E to open management”;
- do not add a new button without input-budget review;
- do not use a modal confirmation for an action that can be physically reversible.

## 3.4 Data-only shortcut

A new catalog row is not a feature unless:

- it is loaded;
- materialized;
- reachable;
- presented;
- interacted with;
- persisted where required.

## 3.5 Test shortcut

Forbidden:

- unit test proves object definition exists;
- source grep proves feature;
- expected telemetry edited to match regression;
- screenshot from isolated asset viewer;
- debug injection skips travel, eligibility, state, or input;
- hidden feature flag treated as player acceptance.

## 3.6 Art shortcut

Forbidden final hero asset:

- primitives with no silhouette plan;
- random boxes around a sphere;
- unmodified stock model;
- texture-only faction variation;
- emissive overload;
- cartoon concept image where realism was requested;
- no gameplay-camera review;
- no LOD/collision/provenance.

## 3.7 System-owner shortcut

Do not:

- write credits outside economy;
- write cargo outside cargo helpers/events;
- write reputation outside factions;
- write derived ship stats outside ships;
- write velocities directly when physics service exists;
- duplicate world/state authority;
- use wall clock in deterministic simulation.

---

# 4. Player-visible outcome format

Use this structure in every task brief.

## Feature name

### Player fantasy

One sentence.

### Exact player sequence

Numbered inputs and observations.

### New verb

State the genuinely new action. If none, explain the combination or world process that creates value.

### Existing systems reused

Name exact current files/events after inspection.

### State transition

Before → action → after.

### Visible transformation

What changes in the world.

### Non-goals

Explicitly bound ambition.

### Failure modes

List specific cheap substitutes.

### Acceptance evidence

Tests, route, capture, performance.

---

# 5. Minimum-observable floors

Numbers are not a substitute for taste, but minimum observables prevent pathological minimalism.

## 5.1 Hero wreck

Must have:

- multiple major hull sections;
- dominant silhouette;
- aligned multi-part collision;
- navigable gap;
- targetable components;
- at least one detached payload;
- persistent visual state.

## 5.2 Station

Must have:

- visible approach;
- aligned docking corridor;
- at least one function visible through traffic or machinery;
- scale hierarchy;
- no central-core docking requirement.

## 5.3 NPC job

Must have:

- authored origin and destination;
- phase state machine;
- visible work behavior;
- manifest/output;
- threat handoff;
- offscreen progression or explicit scope;
- player intervention.

## 5.4 Hazard

Must alter at least one of:

- motion;
- sensor information;
- projectile path;
- access timing;
- component state;
- resource availability.

A pure damage-over-time circle is not sufficient unless paired with another mechanical dimension.

## 5.5 Sector identity

Must have:

- one unique sentence;
- separated pockets;
- visible route;
- hero silhouette;
- local mechanical condition;
- persistent consequence.

## 5.6 Story artifact

Must have:

- real unlock event;
- physical evidence;
- concise optional page;
- consistent image style;
- no mandatory choice;
- no content deletion without physical reason.

---

# 6. Named technical language for prompts

When asking for quality, specify the technique.

## Physics/control

- proportional-derivative controller;
- pure-pursuit path following;
- curvature-aware speed profile;
- target-relative pursuit slot;
- body-frame acceleration command;
- analytic orbit;
- softened inverse-square field;
- spatial-hash broad phase;
- swept-circle collision;
- compound collider;
- capsule/OBB narrow phase;
- deterministic fixed-step integration;
- impulse provenance;
- bounded assist through actuator commands.

## Rendering/assets

- silhouette-first graybox;
- top-down gameplay-camera blockout;
- modular hard-surface kitbashing;
- beveled edges with weighted normals;
- physically based metal/roughness;
- trim sheet;
- decal atlas;
- emissive hierarchy;
- screen-space constant-width line;
- instancing;
- HLOD;
- occlusion/readability review;
- collision-proxy sidecar;
- GLB named-node/component anchors;
- same-framing before/after capture.

## UI

- contextual target reticle;
- progressive disclosure;
- event-driven state updates;
- no per-frame DOM rebuild;
- accessible focus order;
- reduced-motion behavior;
- screen-space pick radius;
- direct manipulation;
- shared component inspector;
- non-modal feedback.

## AI/world

- finite-state job controller;
- authored waypoint route;
- arrival steering;
- velocity matching;
- offscreen virtualization;
- deterministic materialization;
- combat-doctrine handoff;
- causal manifest;
- activity pocket;
- route graph.

---

# 7. Visual-production workflow

## 7.1 Graybox first

Before detail:

- place player ship beside object;
- establish gameplay scale;
- validate silhouette at far/mid/near distances;
- author collision;
- validate approach routes;
- capture.

Do not spend tokens detailing an unusable shape.

## 7.2 Concept reference

Image generation creates reference, not proof.

Require:

- top-down/three-quarter reference;
- side or profile where structure matters;
- material notes;
- damage/state variants;
- explicit realism style;
- no text baked into art.

## 7.3 Modular build

Use kits:

- structural;
- functional;
- damage;
- connectors;
- detail;
- materials.

A hero asset may be unique in composition while reusing kit modules.

## 7.4 Gameplay acceptance

Review:

- normal camera;
- motion;
- fog/lighting;
- HUD;
- neighboring objects;
- actual scale;
- actual LOD;
- actual collision.

## 7.5 Reject and iterate

The agent must be permitted—and required—to reject its own first asset.

A pipeline that always ships candidate one is not an art pipeline.

---

# 8. Image-generation anti-cartoon contract

When realism is requested, include:

- photorealistic cinematic production still;
- live-action casting;
- grounded hard-science-fiction production design;
- practical materials;
- physically plausible anatomy;
- natural asymmetry;
- restrained lighting;
- documentary framing;
- no illustration;
- no painted concept art;
- no comic rendering;
- no cel shading;
- no retro pulp cover;
- no exaggerated heroic pose;
- no toy-like proportions.

Do not use “1950s sci-fi,” “pulp,” “retro-futurist illustration,” or generic “concept art” unless that style is explicitly wanted.

---

# 9. Control-system development protocol

Control bugs are difficult because vague “feel better” requests cause agents to tune symptoms.

For any control feature:

## 9.1 Define frames

- world frame;
- ship/body frame;
- target-relative frame;
- tether radial/tangent frame;
- screen frame.

State which frame each input controls.

## 9.2 Define command

Does input command:

- position;
- velocity;
- acceleration;
- heading;
- angular rate;
- orbit bearing;
- range;
- path?

Never leave this ambiguous.

## 9.3 Define plant limits

- max thrust;
- lateral thrust;
- yaw acceleration;
- yaw rate;
- drag;
- mass;
- tether length/tension.

## 9.4 Define controller

Write equation or pseudocode.

## 9.5 Define override

What cancels assistance and how quickly?

## 9.6 Debug overlay

Show:

- desired state;
- actual state;
- error;
- command;
- saturation;
- active mode.

## 9.7 Scenario matrix

Test across hulls, speeds, target motion, and extreme initial conditions.

---

# 10. Physics-feature protocol

Before adding a force effect:

1. specify force versus impulse;
2. specify mass response;
3. specify source recoil/momentum policy;
4. specify player damage asymmetry;
5. specify projectile/payload filters;
6. specify falloff;
7. cap magnitude;
8. route through physics owner;
9. emit provenance;
10. visualize field/impact.

---

# 11. NPC-job protocol

Before adding an NPC role:

1. origin;
2. destination;
3. route;
4. phase list;
5. visible work;
6. produced/transported thing;
7. threat behavior;
8. offscreen progression;
9. player intervention;
10. state/manifest scan.

If any of these are absent, the NPC is probably another wanderer with a label.

---

# 12. Sector-content protocol

Before populating a sector:

1. write one unique identity sentence;
2. draw pocket/route map;
3. choose hero silhouette;
4. choose one local mechanical condition;
5. choose one causal NPC loop;
6. choose one player-caused persistent change;
7. set far/mid/near visual reads;
8. place entry routes;
9. verify travel time;
10. capture ten minutes of ordinary play.

Do not begin by duplicating the existing station/asteroid/enemy bundle.

---

# 13. Prompt template — implementation planning

> You are planning one bounded SpaceFace gameplay slice against the current repository. Read the root and nested `AGENTS.md` files, current architecture/status authority, and the live owner files before proposing edits. Old plans are context, not proof.
>
> Feature: **[NAME]**
>
> Player-visible outcome: **[ONE PARAGRAPH]**
>
> Required inputs and sequence:
> 1. [INPUT/ACTION]
> 2. [INPUT/ACTION]
> 3. [VISIBLE/PERSISTENT RESULT]
>
> The new verb or combination is: **[VERB]**
>
> Before coding, return:
> - player-observable contract table;
> - owner/file/event map;
> - anti-placeholder criteria;
> - state-transition model;
> - physics/control equations where relevant;
> - asset/collision/component manifest plan;
> - normal-route proof plan;
> - save/load and performance risks;
> - bounded implementation stages.
>
> Do not satisfy this with a label, generic sphere, central collider, toast, hidden flag, data-only row, isolated asset render, or new modal UI. Reuse owners and event seams. A unit test is not player acceptance.

---

# 14. Prompt template — coding session

> Implement the approved **[NAME]** slice. Preserve the current repository’s single-writer, deterministic, public-route, asset, input, accessibility, and shared-tree contracts. Inspect `git status --short` and file-specific diffs before edits; do not destroy concurrent work.
>
> Work in logical stages and verify each:
> 1. [FOUNDATION]
> 2. [INTERACTION]
> 3. [PERSISTENCE]
> 4. [PRESENTATION]
> 5. [NORMAL-ROUTE PROOF]
>
> At each stage report:
> - files changed;
> - exact player-visible outcome now reachable;
> - focused tests run;
> - remaining gaps.
>
> Do not claim completion until the player can reach it through ordinary input and current browser footage proves the intended visual/physical result. Include debug-overlay evidence where collision/control is involved and same-framing before/after evidence where state changes.

---

# 15. Prompt template — visual asset

> Build a gameplay-ready **[ASSET]**, not a symbolic representation. Start with a silhouette-first top-down graybox at the exact world scale beside the player ship. Validate far/mid/near readability and author aligned collision/component anchors before detail.
>
> Visual identity: [MATERIALS, FACTION, FUNCTION, DAMAGE, SILHOUETTE].
>
> Required observables:
> - [MAJOR SECTION 1]
> - [MAJOR SECTION 2]
> - [FUNCTIONAL FEATURE]
> - [STATE VARIANT]
> - [APPROACH/CHANNEL]
>
> Use modular hard-surface kitbashing, PBR metal/roughness, bevels/weighted normals, decals, restrained emissives, and LOD/HLOD appropriate to the gameplay camera. Export GLB plus source, provenance, collision/component sidecar, and gameplay captures. Do not submit an isolated beauty render, generic primitive cluster, molten sphere, scaled ordinary ship, or emissive-heavy placeholder.

---

# 16. Prompt template — control mechanic

> Implement **[CONTROL FEATURE]** as an input-shaping assist through the normal force/torque pipeline. Define world, body, target-relative, and tether frames. Input commands [POSITION/VELOCITY/HEADING/RANGE/BEARING], not an ambiguous arrow.
>
> Controller:
> [EQUATIONS/PSEUDOCODE]
>
> Activation:
> [PRECISE CONDITIONS]
>
> Override:
> [PRECISE CONDITIONS; ONE-TICK OR BOUNDED EXIT]
>
> Hard constraints:
> - no direct position/velocity/rotation writes;
> - respect hull acceleration/turn limits;
> - no hidden target changes;
> - no unexplained full spins;
> - deterministic fixed-step behavior;
> - debug overlay for desired/actual/error/command/saturation.
>
> Test the scenario matrix [LIST]. Provide gameplay capture without debug overlay after numerical tests pass.

---

# 17. Prompt template — NPC job

> Implement **[NPC ROLE]** as a finite-state job controller separate from combat AI.
>
> Origin: [OBJECT]
> Destination: [OBJECT]
> Route: [ROUTE]
> Phases: [LIST]
> Visible work: [ANIMATION/BEHAVIOR]
> Manifest/output: [DATA]
> Threat handoff: [POLICY]
> Offscreen progression: [RULE]
> Player interventions: [LIST]
>
> The NPC is not complete if it merely wanders with a role label. Prove one full origin→work→destination cycle in live play and one interruption/resume or flee case.

---

# 18. Review checklist

A reviewer should ask:

- What can the player do now that was impossible before?
- Is the target physical and correctly scaled?
- Does collision match?
- Does the object visibly change?
- Is the action clear without prose?
- Does it combine with other mechanics?
- Is the result persistent?
- Is it reachable normally?
- Did the agent create a duplicate owner/system?
- Did it add a menu because world interaction was harder?
- Could the same tests pass with a glowing sphere?
- Is the screenshot actually from gameplay?
- Did the first candidate get accepted without taste review?
- Does the feature create a reason to use industry or travel?
- Does the world continue doing something without the player?

If the answer to the “glowing sphere” question is yes, the acceptance criteria are insufficient.
