<!-- LIFETIME: STABLE -->
# Task router

Use this page for a named workflow or recurring symptom. Ordinary code work starts at root
[`AGENTS.md`](../AGENTS.md) → [`MODULE_MAP.md`](./MODULE_MAP.md) → the nearest `AGENTS.md`.
For current whole-game work, the Finish Program README and lane boards are authoritative; this page
does not assign a competing queue.

| Task or symptom | Start here |
|---|---|
| Finish the game, improve the default experience, or choose current work | [`design/program/finish/README.md`](../design/program/finish/README.md) → the relevant Lane 1, 2, or 3 board |
| Performance, startup, loading, hitching, or frame pacing | Finish Lane 1 and its named measurement/check; preserve authored quality. Use [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md) for the relevant comparison. |
| Combat, Swarm, Crucible, Fortify, AI, or physics | Finish Lane 2 and its named gameplay/test owner; design detail comes from the selected task's spec. |
| Adventure, missions, world, economy, story, audio, or screens | Finish Lane 3 and its named owner/spec. |
| Find a module or event/update owner | [`MODULE_MAP.md`](./MODULE_MAP.md), then generated [`SYSTEM_REGISTRY.md`](./SYSTEM_REGISTRY.md) or [`EVENT_ROUTING.md`](./EVENT_ROUTING.md) |
| Recurring bug or known hazard | [`COMMON_BUGS.md`](./COMMON_BUGS.md), then confirm against current source and behavior |
| UI/HUD or visual asset work | [`docs/visual-assets/README.md`](./visual-assets/README.md) for visual craft; then the owning UI/asset guidance. For a player-facing result, verify the changed screen or route directly. |
| Blender/GLB authoring | [`tools/blender/forge/FORGE.md`](../tools/blender/forge/FORGE.md) and [`design/program/GRAPHICS_PROGRAM.md`](../design/program/GRAPHICS_PROGRAM.md) |
| Product direction or system design | [`design/VISION.md`](../design/VISION.md) → relevant sections of [`design/GDD_2_0.md`](../design/GDD_2_0.md) and the selected active spec |
| Tests, checks, or browser/Electron validation | [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md), plus `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` for the files involved |
| Add a map-visible place or station | `src/data/PLACE_REGISTRATION.md` and its current atlas/map check |
| Asset manifest, release bundle, or deploy issue | [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) and [`COMMON_BUGS.md`](./COMMON_BUGS.md) §15 |

Read only the sections and artifacts required by the active task. Historical campaign plans, old
acceptance packs, and completed-work ledgers are context, not automatic assignments or extra review
gates. The Finish README defines current shared workflow and verification scope.
