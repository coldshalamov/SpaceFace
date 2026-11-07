<!-- LIFETIME: STABLE -->
# Task router

Use this page for a named workflow or recurring symptom. Ordinary code work starts at root
[`AGENTS.md`](../AGENTS.md) → [`MODULE_MAP.md`](./MODULE_MAP.md) → the nearest `AGENTS.md`.
For current whole-game work, [`MASTER_PLAN.md`](../design/program/finish/MASTER_PLAN.md) owns the
campaigns and [`MASTER_LANES.md`](../design/program/finish/MASTER_LANES.md) owns the seven-lane
dispatch (PIPELINE, SIM CORE, RENDERER, SHIP, WORLD, LOOK & SOUND, QUALITY). The older three Finish
boards are outcome detail, not a second queue. This page does not assign a competing queue.

| Task or symptom | Start here |
|---|---|
| Finish the game, improve the default experience, or choose current work | [`MASTER_PLAN.md`](../design/program/finish/MASTER_PLAN.md) → [`MASTER_LANES.md`](../design/program/finish/MASTER_LANES.md) → [`EXECUTION_STATUS`](../design/program/finish/EXECUTION_STATUS_2026-11-06.md) |
| Performance, startup, loading, hitching, or frame pacing | Master lane 1 PIPELINE (E10/E1/E5/E9) and the named measurement/check; preserve authored quality. Use [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md) for the relevant comparison. |
| Combat, Swarm, Crucible, Fortify, AI, physics, or simulation cost | Master lane 2 SIM CORE (E3/E2/E4), SWARM lanes F/S, and the named gameplay/test owner. |
| Adventure, missions, world, economy, story, audio, or screens | Master lanes 4 SHIP / 5 WORLD / 6 LOOK & SOUND and the named owner/spec. |
| Find a module or event/update owner | [`MODULE_MAP.md`](./MODULE_MAP.md), then generated [`SYSTEM_REGISTRY.md`](./SYSTEM_REGISTRY.md) or [`EVENT_ROUTING.md`](./EVENT_ROUTING.md) |
| Recurring bug or known hazard | [`COMMON_BUGS.md`](./COMMON_BUGS.md), then confirm against current source and behavior |
| UI/HUD or visual asset work | [`docs/visual-assets/README.md`](./visual-assets/README.md) for visual craft; then the owning UI/asset guidance. For a player-facing result, verify the changed screen or route directly. |
| Blender/GLB authoring | [`tools/blender/forge/FORGE.md`](../tools/blender/forge/FORGE.md) and [`design/program/GRAPHICS_PROGRAM.md`](../design/program/GRAPHICS_PROGRAM.md) |
| Product direction or system design | [`design/VISION.md`](../design/VISION.md) → relevant sections of [`design/GDD_2_0.md`](../design/GDD_2_0.md) and the selected active spec |
| Tests, checks, or browser/Electron validation | [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md), plus `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` for the files involved |
| Add a map-visible place or station | `src/data/PLACE_REGISTRATION.md` and its current atlas/map check |
| Asset manifest, release bundle, or deploy issue | [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) and [`COMMON_BUGS.md`](./COMMON_BUGS.md) §15A |

Read only the sections and artifacts required by the active task. Historical campaign plans, old
acceptance packs, and completed-work ledgers are context, not automatic assignments or extra review
gates. The Finish README defines current shared workflow and verification scope.
