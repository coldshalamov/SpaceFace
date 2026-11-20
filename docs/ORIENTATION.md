<!-- LIFETIME: STABLE -->
# SpaceFace orientation

This is a short map of the game and repository. Start at root [`AGENTS.md`](../AGENTS.md) and
follow the [fleet README](../design/program/fleet/README.md) to the active work queue.
[`TASK_ROUTER.md`](./TASK_ROUTER.md) points to named workflows. These documents route work; they do
not duplicate volatile status.

## The game

SpaceFace is a top-down 2.5D space game for browser and Electron. The player flies with momentum,
mines, trades, fights, takes missions, upgrades, and builds passive income in a living universe.
Its product intent is in [`design/VISION.md`](../design/VISION.md) and
[`design/GDD_2_0.md`](../design/GDD_2_0.md); player controls are in the root `README.md`.

## Runtime shape

A flat `GameState`, event bus, and system registry run a fixed-step simulation separately from
rendering. Simulation code stays independent of Three.js and uses `state.rng` and `state.simTime`
for deterministic behavior. Rendering, DOM UI, audio, save, and presentation have separate owners;
content is data-driven. Browser and Electron use the same game route. See
[`ARCHITECTURE.md`](../ARCHITECTURE.md) for the technical contracts and
[`docs/SYSTEM_REGISTRY.md`](./SYSTEM_REGISTRY.md) / [`docs/EVENT_ROUTING.md`](./EVENT_ROUTING.md)
for generated indexes.

## Repository map

| Path | Contents and entry point |
|---|---|
| `src/` | Runtime code. Start with [`MODULE_MAP.md`](./MODULE_MAP.md), then read the nearest `AGENTS.md`. |
| `src/core/`, `src/runtime/`, `src/systems/` | State, runtime assembly, and fixed-step simulation. |
| `src/render/`, `src/ui/`, `src/audio/`, `src/save/` | Rendering, screens, sound, and persistence; each has local ownership guidance. |
| `src/data/`, `src/world/`, `src/story/` | Catalogs, world state, and narrative systems. |
| `assets/` | Authored ships, places, props, portraits, and art; start at `assets/AGENTS.md` and the asset docs. |
| `design/` | Product intent and selected design specifications. Read only the section activated by the task. |
| `design/program/fleet/` | Current work queue, operating rules and quality checkpoint. |
| `docs/` | Engineering navigation, contracts, validation, and historical context. See `docs/README.md`. |
| `test/`, `scripts/`, `tools/` | Tests, checks, and production tooling; read the nearest `AGENTS.md`. |
| `styles/`, `electron/`, `schemas/` | Styling, desktop shell, and data schemas. |
| `build/`, `dist/`, `node_modules/`, `.devshots/`, `scratch/` | Generated output or local evidence, not source authority. |

## Where to start

| Need | Read |
|---|---|
| Fleet assignment | [Fleet README](../design/program/fleet/README.md) → queue → the selected task's spec and source owner |
| Find a code owner | [`MODULE_MAP.md`](./MODULE_MAP.md) → nearest `AGENTS.md` |
| Trace state or update order | `ARCHITECTURE.md` → generated `SYSTEM_REGISTRY.md` / `EVENT_ROUTING.md` |
| Diagnose a recurring defect | [`COMMON_BUGS.md`](./COMMON_BUGS.md) and the live owner |
| Validate a change | [`VALIDATION_WORKFLOW.md`](./VALIDATION_WORKFLOW.md) and relevant test/check instructions |
| Navigate a named specialty | [`TASK_ROUTER.md`](./TASK_ROUTER.md) |
| Determine which documents direct work | [`POLICY_MANIFEST.md`](./POLICY_MANIFEST.md) |

Large references are section-addressable: read the section the active task names, not the entire
file. Historical plans, reviews, captures, and agent notes explain prior decisions; they do not
replace current user direction, fleet assignments, live source, or relevant behavior checks.
