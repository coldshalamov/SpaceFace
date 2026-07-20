# SpaceFace Gravity & Massline Expansion Package

## Purpose

This package turns the current gravity, massline, planetary, physics-combat, and world-activity discussion into bounded implementation documents that can be pasted into planning threads or coding-agent sessions without re-explaining the design intent.

The package is written around the actual constraint of SpaceFace: the game is a top-down Newtonian-ish space game with keyboard flight, independent cursor aim, a physical massline, impulse effects, a developing asteroid-industry layer, and an open world whose current sectors and NPC activity are too homogeneous. The goal is not to build a scientific orbital simulator. The goal is to make **assisted relational physics** the game's distinctive play language.

The central design sentence is:

> The player chooses the body, direction, risk, and moment; the flight computer supplies the precision needed to make that intention physically legible.

## Package contents

1. `01_DESIGN_BIBLE_ASSISTED_RELATIONAL_PHYSICS.md`  
   The governing thesis, design laws, shared primitives, gameplay pillars, and feature taxonomy.

2. `02_CONTROL_TARGETING_ORBIT_AND_SLINGSHOT.md`  
   Intent-aware tether acquisition, input ergonomics, flyby focus, orbit assist, line-length control, release windows, slingshot chains, and route validation.

3. `03_GRAVITY_WEAPONS_AND_MASSLINE_VARIANTS.md`  
   Physics-first combat, weapon knockback, mass seeds, repulsors, inertial manipulation, alternative masslines, drag nets, twin bridles, and combat combinations.

4. `04_PLANETARY_ACTIVITIES_HEISTS_AND_SECTOR_IDENTITY.md`  
   Planetary slingshot courses, atmospheric skimming, mass-driver theft, satellite operations, convoys, meteor hitchhiking, black-hole regions, missions, and sector archetypes.

5. `05_VFX_AND_PRESENTATION_TECHNICAL_DIRECTION.md`  
   Runtime techniques and exact vocabulary for replacing primitive translucent tubes and N64-like effects with readable modern Three.js VFX.

6. `06_IMPLEMENTATION_ROADMAP_TESTING_AND_AGENT_LANES.md`  
   Dependency order, vertical slices, three-agent work partitioning, deterministic tests, browser evidence, and anti-placeholder gates.

7. `07_PASTEABLE_AGENT_BRIEFS.md`  
   Standalone briefs in the format: problem → consequence → proposed solution → implementation direction → acceptance → forbidden shortcuts.

8. `08_MASTER_IMPLEMENTATION_HANDOFF_TEMPLATE.md`  
   Reusable wrapper that forces repository audit, ownership mapping, evidence, and anti-shortcut discipline.

9. `SPACEFACE_GRAVITY_MASSLINE_COMBINED.md`  
   All documents concatenated into one searchable file.

## Recommended use

Do not hand the whole package to one coding agent and ask it to “implement gravity.” That invitation produces a field shader, a radial force, two toasts, and a victory lap.

Use this workflow:

1. Select one brief from `07_PASTEABLE_AGENT_BRIEFS.md`.
2. Paste it into a planning thread and require a current-repository audit before implementation.
3. Require the planner to name existing owners, files, event seams, tests, and player-route evidence.
4. Hand the bounded plan to the coding agent.
5. Reject completion unless the ordinary game route visibly proves the mechanic.

## Recommended first sequence

The correct dependency order is:

1. Intent-aware tether targeting.
2. Massline input and line-control ergonomics.
3. Anchor-relative orbit assist.
4. Slingshot release prediction and one authored sling course.
5. Baseline physical weapon impulse.
6. Mass Seed and Repulsor Seed.
7. Atmospheric reentry payoff.
8. NPC routes and planetary activities.
9. Sector recomposition around movement topology.
10. Industrial manufacture of permanent physics infrastructure.

## Scope guardrail

This package intentionally rejects a full N-body simulator, universal mutual gravity, manual spacecraft attitude micromanagement, large dialogue trees, and dozens of unrelated action keys. Complexity should arise from combinations of a few stable laws, not from a cockpit keyboard that looks like an organ donated by NASA.
