# SpaceFace Gameplay Depth Playbook

**Purpose:** a set of self-contained, pasteable design and implementation briefs for turning SpaceFace from a collection of largely interchangeable objects and inputs into a game whose movement, combat, world activity, industry, and story reinforce one another.

**Repository context inspected:** `coldshalamov/SpaceFace`, default-branch snapshots observed around commits `cb60752c`, `c6cee0cf`, and neighboring July 2026 work. The tree is moving quickly. Every coding agent must re-read current owner files and `AGENTS.md` contracts before editing.

This package is deliberately not a fantasy wishlist. It distinguishes:

- foundational engine primitives that make many later features possible;
- low-risk content and behavior work that agents can implement now;
- experimental mechanics that need isolated prototypes;
- ideas that should be deferred because they are expensive, brittle, or mostly administrative;
- acceptance criteria designed to prevent “technically present” features that never become a player experience.

## Recommended reading order

1. **`00_NORTH_STAR_AND_DESIGN_CONSTRAINTS.md`**  
   Defines the game SpaceFace is trying to become, the progression payoff, the interaction grammar, and the non-goals.

2. **`01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md`**  
   The critical technical substrate: collision proxies, targetable components, dynamic payloads, force fields, contextual tools, persistent site states, and NPC job controllers.

3. **`02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md`**  
   Concrete massline moves, orbit assistance, trackpad control alternatives, physics weapons, combat arenas, and exact controller mathematics.

4. **`03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md`**  
   How to make sectors spatially distinct and alive through activity pockets, traffic routes, orbital operations, jobs, crime, hazards, and landmarks.

5. **`04_WRECK_CATHEDRAL_VERTICAL_SLICE.md`**  
   A complete agent-ready specification for one monumental wreck adapted to SpaceFace’s top-down plane, current input vocabulary, and present engine limitations.

6. **`05_AUTOMATION_PROGRESSION_AND_ENDGAME.md`**  
   Answers “revenue streams for what?” by connecting Asteroid Ops to deployables, infrastructure, mobility, world transformation, settlement, and regional control.

7. **`06_STORY_LEDGER_AND_IMAGE_PIPELINE.md`**  
   A non-blocking, non-branch-pruning story system using brief flight fragments, illustrated ledger pages, maps, evidence, and persistent discoveries.

8. **`07_AGENT_EXECUTION_CONTRACT.md`**  
   The anti-slop contract, prompt templates, visual terminology, evidence requirements, and forbidden shortcuts.

9. **`08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md`**  
   Dependency-aware build waves and a safe division of labor for three coding agents.

10. **`09_PASTEABLE_FEATURE_BRIEFS.md`**  
    A large idea bank. Each section is written to stand alone when pasted into another Pro-mode or coding-agent conversation.

11. **`10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md`**  
    A grounded map of what already exists, what is only semantic or test-level depth, what should be protected, and which missing seams block the game.

12. **`11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md`**  
    Concrete game-dev, control, physics, rendering, UI, AI, persistence, testing, and image-generation vocabulary for writing prompts that close the agents’ easiest escape hatches.

13. **`12_MASTER_AGENT_HANDOFF_TEMPLATE.md`**  
    A ready-to-paste audit, planning, implementation, anti-placeholder, and evidence template for turning any individual brief into a controlled coding-agent task.

## The central diagnosis

SpaceFace already contains more design and system machinery than the current player experience reveals. The repository includes named zones, regional ecology, unique-wreck provenance, asteroid-site production, massline throw assistance, tumbles, impulse charges, wing orders, and other deep concepts. Yet the live game often compresses these concepts into one of four player-visible outcomes:

1. a circle or sphere with a label;
2. an NPC that wanders and sometimes shoots;
3. a beam that yields `+1` material;
4. a station that opens a screen.

The playbook treats this as a **translation failure** between semantic systems and embodied gameplay. The next major gains come from making existing and future systems physical, spatial, legible, and combinable—not from adding more ledgers or more names.

## How to use an individual brief

Paste one brief into a planning model and require it to return:

1. an implementation plan against the current repository;
2. an owner/file map;
3. a minimal vertical slice;
4. deterministic tests;
5. a default-route browser capture plan;
6. explicit anti-placeholder criteria;
7. a list of existing systems reused rather than duplicated.

Then paste the expanded plan into the coding session together with `07_AGENT_EXECUTION_CONTRACT.md`.

## Truth hierarchy

In this project, use the following order:

1. **What a player can reach on the normal route**
2. **What current browser/Electron footage shows**
3. **What runtime telemetry proves**
4. **What deterministic tests prove**
5. **What code exists**
6. **What a design document claims**

A sophisticated data table feeding an invisible or generic object is not a sophisticated game feature. A green unit test is not a player experience. A routed GLB with an unrelated spherical collider is not a physical structure.
