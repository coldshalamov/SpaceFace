<!-- LIFETIME: STABLE -->
# SpaceFace inference lanes — the development entrypoint

```
SPACEFACE COMMANDS

NEXT
Continue the existing admitted program.
Use the normal queue/dispatcher.

INFERENCE <Nx> [optional scope]
Spend creative/production inference making the game richer,
better, more polished, and closer to the intended SpaceFace.

Examples:
INFERENCE 1x
INFERENCE 3x NPCS
INFERENCE 5x WORLD
INFERENCE 3x GRAPHICS
INFERENCE 5x POLISH
WF-01 3x
```

**Default INFERENCE job:** make the game obviously better in line with VISION.md. Usually that means
**strengthening weak implementations** or adding **new** fitting content where more would clearly
help (roles, places, jobs, craft, tools). The owner should not have to restate samey/blocky/empty.
Do not invent a new product strategy each time.

**Ledger (mandatory, keep it short):** [`INFERENCE_LEDGER.md`](./INFERENCE_LEDGER.md) — weak surfaces
and recent +1s. Prefer weak/underfed; avoid pile-on. Tick +1 when a unit finishes.

This is the single obvious entrypoint when the request is to **expand, improve, deepen, diversify,
populate, polish, or otherwise develop the actual game** using reusable creative-production workflows.

Before entering any lane, internalize [`design/VISION.md`](../VISION.md) — the owner's statement of
the fantasy and UVP — and [`00_SPACEFACE_TEAM_MINDSET.md`](../inference-workflows/00_SPACEFACE_TEAM_MINDSET.md).
VISION.md outranks every other document's emphasis.

## What these lanes are

The inference lanes are **reusable workflows for spending model inference to make the real game
richer** — NPCs, enemies, sectors, economy, story, graphics, VFX, audio, gameplay feel, content depth,
and whole playable slices. Each workflow turns a vague "make X better" into a disciplined loop:
observe ordinary play → state the target experience → generate varied candidates → select and cut →
implement through current owners → obtain cold adversarial review → revise/rebuild/cut → prove on the
ordinary route → record what was learned.

They do **not** replace [`program-queue.json`](./roadmap/program-queue.json),
`scripts/program-dispatch.mjs`, packets, or acceptance. They are supporting creative and production
doctrine. The moment a lane produces concrete implementation work, **normal repo ownership, queue,
packet, and testing rules apply** — stage owned files, run focused checks, and obtain the acceptance
the active packet requires. An `Nx` request, a workflow label, or an agent review grants no priority,
lease, path ownership, or acceptance of its own.

> Two doors, one building:
>
> - **"What exact existing tasks can I finish?"** → existing queue / dispatcher (see
>   [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) §1).
> - **"Where do I go to spend inference making the game richer?"** → you are here.

## The workflows

Full workflow library and supporting doctrine live in
[`design/inference-workflows/`](../inference-workflows/README.md). Start at that README, then open the
specific workflow. The symptom-to-workflow router is
[`07_WORKFLOW_ROUTER.md`](../inference-workflows/07_WORKFLOW_ROUTER.md) when the request is a symptom
("the world feels empty", "combat is hold-fire-until-dead", "graphics look generic") rather than a
named domain.

| ID | Workflow | Best for | File |
|---|---|---|---|
| WF-01 | NPC Occupations & Living World | deepening traffic into readable working people, jobs, incidents, and ecology | [`workflows/WF-01_NPC_LIVING_WORLD.md`](../inference-workflows/workflows/WF-01_NPC_LIVING_WORLD.md) |
| WF-02 | Enemy Roster & Encounters | distinct combat roles and encounter variety using existing AI/combat/physics | [`workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md`](../inference-workflows/workflows/WF-02_ENEMY_ROSTER_AND_ENCOUNTERS.md) |
| WF-03 | Sector & World Composition | making a sector/pocket more distinct, populated, and activity-dense | [`workflows/WF-03_SECTOR_WORLD_COMPOSITION.md`](../inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md) |
| WF-04 | Stations, Planets & World Sites | turning fixtures/menu-entrances into embodied destination operations | [`workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md`](../inference-workflows/workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md) |
| WF-05 | Weapons, Physics Tools & Modules | mechanically distinct physical tools with multiple uses | [`workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md`](../inference-workflows/workflows/WF-05_WEAPONS_PHYSICS_TOOLS_AND_MODULES.md) |
| WF-06 | Economy, Industry & Logistics | visible value-flow chains that give work and crime a reason to exist | [`workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md`](../inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md) |
| WF-07 | Progression, Ships & Infrastructure | capability milestones, builds, and player-grown infrastructure | [`workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md`](../inference-workflows/workflows/WF-07_PROGRESSION_SHIPS_BUILDS_AND_INFRASTRUCTURE.md) |
| WF-08 | Missions, Heists & Activities | playable, player-interruptible activity packages | [`workflows/WF-08_MISSIONS_HEISTS_CONTRACTS_AND_WORLD_ACTIVITIES.md`](../inference-workflows/workflows/WF-08_MISSIONS_HEISTS_CONTRACTS_AND_WORLD_ACTIVITIES.md) |
| WF-09 | Narrative, Characters & Ledger | open narrative threads and characters worth remembering | [`workflows/WF-09_NARRATIVE_CHARACTERS_AND_LEDGER.md`](../inference-workflows/workflows/WF-09_NARRATIVE_CHARACTERS_AND_LEDGER.md) |
| WF-10 | Exploration & Discovery | curiosity and discovery chains, not checklist reveals | [`workflows/WF-10_EXPLORATION_DISCOVERY_AND_MYSTERY.md`](../inference-workflows/workflows/WF-10_EXPLORATION_DISCOVERY_AND_MYSTERY.md) |
| WF-11 | Graphics Asset Families & World Dressing | production asset families toward the intended professional visual standard | [`workflows/WF-11_GRAPHICS_ASSET_FAMILIES_AND_WORLD_DRESSING.md`](../inference-workflows/workflows/WF-11_GRAPHICS_ASSET_FAMILIES_AND_WORLD_DRESSING.md) |
| WF-12 | VFX, Camera, Lighting & Visual Feel | kinetic visual presentation — impact, motion, energy | [`workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md`](../inference-workflows/workflows/WF-12_VFX_CAMERA_LIGHTING_AND_VISUAL_FEEL.md) |
| WF-13 | Audio, Music & World Sound | semantic audio identity for traffic, work, combat, place | [`workflows/WF-13_AUDIO_MUSIC_AND_WORLD_SOUND.md`](../inference-workflows/workflows/WF-13_AUDIO_MUSIC_AND_WORLD_SOUND.md) |
| WF-14 | UI, UX & Onboarding | complete player-task/information packages, not more panels | [`workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md`](../inference-workflows/workflows/WF-14_UI_UX_ONBOARDING_AND_INFORMATION.md) |
| WF-15 | Gameplay Feel, Controls & Balance | resolving the largest player-facing feel/control/combat defects | [`workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md`](../inference-workflows/workflows/WF-15_GAMEPLAY_FEEL_CONTROLS_AND_BALANCE.md) |
| WF-16 | Variants, States & Aftermath | multiplying accepted content through meaningful siblings/states/incidents | [`workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md`](../inference-workflows/workflows/WF-16_CONTENT_VARIANTS_STATES_AND_AFTERMATH.md) |
| WF-17 | Vertical Slice & Portfolio Integration | composing accepted systems/assets into one production-quality playable slice | [`workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md`](../inference-workflows/workflows/WF-17_VERTICAL_SLICE_AND_PORTFOLIO_INTEGRATION.md) |
| WF-18 | Design Recovery & Simplification | recovering where the implementation drifted from the intended game | [`workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md`](../inference-workflows/workflows/WF-18_DESIGN_RECOVERY_AND_SIMPLIFICATION.md) |
| WF-19 | Technical Production & Scaling | quality-enabling performance/scaling improvements (no quality cuts) | [`workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md`](../inference-workflows/workflows/WF-19_TECHNICAL_PRODUCTION_AND_PERFORMANCE_SCALING.md) |

One-line example invocations (copy-ready):

```text
WF-01 3x — deepen NPC occupations and lived-world activity in Ceres.
WF-02 3x — expand enemy roles and encounter variety using the existing combat/physics systems.
WF-03 3x — make three existing sectors more distinct, populated, and activity-dense.
WF-11 5x — improve asset families/world dressing toward the intended professional visual standard.
WF-12 3x — improve VFX, camera, lighting, motion, and kinetic visual presentation.
WF-15 3x — identify and fix the largest gameplay-feel/control/combat problems in ordinary play.
WF-16 5x — multiply existing content through meaningful states, incidents, variants, and aftermath.
WF-17 5x — compose multiple existing systems/assets into a production-quality playable slice.
WF-18 3x — identify where the current implementation drifted from the intended game and simplify/recover it.
```

## Scale shorthand (`Nx`)

This is sizing shorthand, **not** a scheduling system. The admitted packet still decides whether `N`
units are coherent, whether fewer are more truthful, and what proof each needs.

- **`1x`** — one substantial, reviewed improvement.
- **`3x`** — three related/diverse reviewed improvements.
- **`5x`** — a larger coherent production tranche.

`Nx` counts **independently reviewable accepted production units** — never files, commits, candidates,
recolors, or test cases. Full candidate-budget, diversity, and stop-rule detail is in
[`01_SCALE_AND_DISPATCH.md`](../inference-workflows/01_SCALE_AND_DISPATCH.md).

## Generic activation prompt

```text
Run <WF-ID> at <1x/3x/5x> for <scope>.

Read the workflow, current product authority, current repo state, and relevant live owners first.

Use the workflow to generate, compare, implement, review, and iterate real player-facing improvements.

Do not stop at planning, candidate files, source-only assets, tests, or technical existence.

Use the existing SpaceFace coordination/ownership/packet/acceptance system for any concrete
implementation work the lane produces.
```

For the longer-form invocation template, see
[`templates/INVOCATION_TEMPLATE.md`](../inference-workflows/templates/INVOCATION_TEMPLATE.md).

## How this relates to the rest of the program

- **Existing exact tasks** (queue units, packets, dispatcher): unchanged and just as accessible. For a
  known exact task, use [`AGENT_TASK_PROMPTS.md`](./AGENT_TASK_PROMPTS.md) and `program-dispatch`.
- **Cross-system product direction** (thirty portfolio axes, launch-coherence stories):
  [`design/vision/GAME_DIRECTION_EXPANSION.md`](../vision/GAME_DIRECTION_EXPANSION.md).
- **The retained inference-to-convergence method** (diagnose / diverge / select / review / revise,
  advisory dispositions `KEEP`/`REVISE`/`REBUILD`/`CUT`):
  [`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](../vision/INFERENCE_CONVERGENCE_METHOD.md). The
  workflows above are the concrete domain instances of that method; the method is the reasoning, the
  workflows are where you spend it.
