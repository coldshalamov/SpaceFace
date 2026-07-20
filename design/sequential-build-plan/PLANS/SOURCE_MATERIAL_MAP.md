# Source Material Map

The reference files are included for design context and vocabulary. They are not live repository authority. Every prompt already contains its own essential causal context; use these files to deepen implementation reasoning, not to overwrite current code truth.

## Core reference groups

### `program`
- `reference/SpaceFace_Dev_Plans.txt`
- `reference/spaceface_depth_playbook/07_AGENT_EXECUTION_CONTRACT.md`
- `reference/spaceface_depth_playbook/08_PRIORITIZED_ROADMAP_FOR_THREE_AGENTS.md`
- `reference/spaceface_depth_playbook/10_CURRENT_REPO_AUDIT_AND_GAP_MAP.md`
- `reference/spaceface_depth_playbook/12_MASTER_AGENT_HANDOFF_TEMPLATE.md`
- `reference/spaceface_universe_atlas_prompt_pack/00_COMMON_CONTEXT.md`
- `reference/spaceface_universe_atlas_prompt_pack/01_PROGRAM_LEAD.md`
- `reference/spaceface_universe_atlas_prompt_pack/11_INTEGRATION_EVALS.md`

### `massline`
- `reference/spaceface_depth_playbook/01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md`
- `reference/spaceface_depth_playbook/02_MASSLINE_FLIGHT_AND_PHYSICS_COMBAT.md`
- `reference/spaceface_gravity_massline_package/01_DESIGN_BIBLE_ASSISTED_RELATIONAL_PHYSICS.md`
- `reference/spaceface_gravity_massline_package/02_CONTROL_TARGETING_ORBIT_AND_SLINGSHOT.md`
- `reference/spaceface_gravity_massline_package/03_GRAVITY_WEAPONS_AND_MASSLINE_VARIANTS.md`
- `reference/spaceface_gravity_massline_package/05_VFX_AND_PRESENTATION_TECHNICAL_DIRECTION.md`
- `reference/spaceface_gravity_massline_package/06_IMPLEMENTATION_ROADMAP_TESTING_AND_AGENT_LANES.md`
- `reference/spaceface_gravity_massline_package/07_PASTEABLE_AGENT_BRIEFS.md`

### `world_sites`
- `reference/spaceface_depth_playbook/01_ENGINE_PRIMITIVES_AND_INTERACTION_GRAMMAR.md`
- `reference/spaceface_depth_playbook/03_LIVING_WORLD_SECTORS_PLANETS_AND_NPC_JOBS.md`
- `reference/spaceface_depth_playbook/04_WRECK_CATHEDRAL_VERTICAL_SLICE.md`
- `reference/spaceface_depth_playbook/05_AUTOMATION_PROGRESSION_AND_ENDGAME.md`
- `reference/spaceface_depth_playbook/09_PASTEABLE_FEATURE_BRIEFS.md`
- `reference/spaceface_gravity_massline_package/04_PLANETARY_ACTIVITIES_HEISTS_AND_SECTOR_IDENTITY.md`

### `atlas`
- `reference/spaceface_universe_atlas_prompt_pack/00_COMMON_CONTEXT.md`
- `reference/spaceface_universe_atlas_prompt_pack/04_ATLAS_SPATIAL_TRUTH.md`
- `reference/spaceface_universe_atlas_prompt_pack/05_MAP_EXPERIENCE.md`
- `reference/spaceface_universe_atlas_prompt_pack/06_NAVIGATION_ROUTE_EXECUTOR.md`
- `reference/spaceface_universe_atlas_prompt_pack/07_PROPULSION_TRAVEL_BURN.md`
- `reference/spaceface_universe_atlas_prompt_pack/08_VFX_RCS_ENVIRONMENT.md`
- `reference/spaceface_universe_atlas_prompt_pack/09_PHYSICAL_LANES_TRAVEL_ECOLOGY.md`
- `reference/spaceface_universe_atlas_prompt_pack/10_CONTENT_PIPELINE_HOLOGRAPHS.md`

### `story_visual`
- `reference/spaceface_depth_playbook/06_STORY_LEDGER_AND_IMAGE_PIPELINE.md`
- `reference/spaceface_depth_playbook/11_PROMPTING_GLOSSARY_AND_TECHNIQUE_LEXICON.md`
- `reference/spaceface_gravity_massline_package/05_VFX_AND_PRESENTATION_TECHNICAL_DIRECTION.md`
- `reference/spaceface_universe_atlas_prompt_pack/08_VFX_RCS_ENVIRONMENT.md`
- `reference/spaceface_universe_atlas_prompt_pack/10_CONTENT_PIPELINE_HOLOGRAPHS.md`

## Prompt-to-reference map

| Prompt | Recommended reference groups |
|---|---|
| `SF-00` — Live Repository Truth Reconciliation and Sequence Bootstrap | `program` |
| `SF-01` — Integrated Browser/Electron, Graphics, and Performance Baseline Closure | `program`, `atlas` |
| `SF-02` — Deterministic Physics-Control Laboratory and Telemetry | `program`, `massline` |
| `SF-03` — Intent-Aware Tether Acquisition and Pre-Latch Preview | `massline` |
| `SF-04` — Massline Input Grammar, Buffered Intent, Reel, Pay-Out, and Cut | `massline` |
| `SF-05` — Anchor-Relative Orbit Assist Through Bounded Physics Commands | `massline` |
| `SF-06` — Shared Release Predictor, Validated Sling Course, and Speed-Language Presentation | `massline`, `atlas`, `story_visual` |
| `SF-07` — Replace Flailing Gesture Flight with Target-Relative Dogfight Control | `massline` |
| `SF-08` — Compound Planar Collision Proxies and Truthful Exterior Docking | `massline`, `world_sites` |
| `SF-09` — Universal Weapon Impulse and Collision-Consequence Kernel | `massline`, `world_sites` |
| `SF-10` — Physics-Weapon Vertical Slice: Concussion Cannon, RCS Disruptor, and Vector Mine | `massline`, `world_sites`, `story_visual` |
| `SF-11` — Deployable Anchor Mass Seed | `massline`, `world_sites`, `story_visual` |
| `SF-12` — Continuous Field Kernel, Attractive Well, Repulsor, and Clearing Cone | `massline`, `world_sites`, `story_visual` |
| `SF-13` — Mass-Coupling Tactics: Inertial Shunt, Gravity Mark, and Momentum Sink | `massline`, `world_sites` |
| `SF-14` — Planetary Sling, Atmospheric Skim, and Enemy Reentry Vertical Slice | `massline`, `world_sites`, `atlas`, `story_visual` |
| `SF-15` — Generic NPC Job Controller with Miner, Hauler, and Patrol Loops | `world_sites` |
| `SF-16` — Surface-Launch Cargo, Catcher, Heist, Patrol, and Heat Loop | `world_sites`, `atlas`, `story_visual` |
| `SF-17` — Shared Interaction Descriptors and Component-Level Targeting | `world_sites` |
| `SF-18` — Contextual Industrial Beam, Detachable Payloads, and Receivers | `world_sites`, `story_visual` |
| `SF-19` — Persistent Multi-Component World Site and Operation-Recipe Kernel | `world_sites` |
| `SF-20` — Wreck Cathedral Monumental Site Vertical Slice | `world_sites`, `story_visual` |
| `SF-21` — Recompose One Sector into Activity Pockets and Route Topology | `world_sites`, `atlas`, `story_visual` |
| `SF-22` — Environmental Machinery, Debris Current, and Timed Access Hazard | `world_sites`, `story_visual` |
| `SF-23` — Asteroid Formation Exteriorization and Progressive Survey | `world_sites`, `atlas`, `story_visual` |
| `SF-24` — Asteroid Ops Heat, Signature, and Operator-Diagnostic Consequences | `world_sites`, `story_visual` |
| `SF-25` — Transforming Industrial Claim and Visible Outpost Assembly | `world_sites`, `story_visual` |
| `SF-26` — Manufactured Physics and Travel Infrastructure | `world_sites`, `atlas`, `story_visual` |
| `SF-27` — Practical Specialized Masslines: Tractor, Frame Coupler, and Elastic Whip | `massline`, `story_visual` |
| `SF-28` — Advanced Massline Combat: Monofilament Sweep and Transverse Snare | `massline`, `story_visual` |
| `SF-29` — Twin Bridle World-to-World Tether | `massline`, `story_visual` |
| `SF-30` — Ship’s Ledger, Nonblocking Story Fragments, and Illustrated Evidence Pipeline | `world_sites`, `story_visual` |
| `SF-31` — Visual-Family Production Pipeline and Representative Ship/World Families | `world_sites`, `story_visual` |
| `SF-32` — Physics HUD, VFX Language, Camera, and Accessibility Consolidation | `massline`, `atlas`, `story_visual` |
| `SF-33` — Gold-Corridor Thirty/Ninety-Minute Gameplay Integration | `program`, `atlas` |
| `SF-34` — Embodied Story, Ownership, Endings, and Post-Ending Sandbox | `world_sites`, `story_visual` |
| `SF-35` — Final Save, Performance, Platform, Accessibility, and Release Closeout | `program`, `atlas`, `story_visual` |

## Current-repository sources always outrank the references

At minimum, agents must read the live root/nested `AGENTS.md`, `ARCHITECTURE.md`, `design/GDD_2_0.md`, current `design/program` authority surfaces, current imports/registry/defaults, relevant tests/checks, and current git history. The included references may describe a feature that has since landed, been replaced, or been rejected.
