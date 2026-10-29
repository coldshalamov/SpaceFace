<!-- LIFETIME: STABLE -->
# SpaceFace — agent orientation map

The whole repo on one page: what the game is, how it works, where everything lives, and what to read
for your job. Root [`../AGENTS.md`](../AGENTS.md) is the always-loaded front door (law + contracts).
Named campaign doors live in [`TASK_ROUTER.md`](./TASK_ROUTER.md) and are read by need. This file is
the second sit-down read. It holds no volatile status — status pointers are named, never copied.

## The game in one paragraph

SpaceFace is a top-down (2.5D) space action/trading game for desktop browser and Electron: fly one
ship with real momentum in a busy little universe — mine asteroids, trade on a living supply/demand
economy, fight pirates, take missions, upgrade through a tech tree, and build capped passive income
(drones, hired traders, outposts). The fantasy (per `design/VISION.md`, the product authority): the
player understands how the world moves and uses that understanding to cause ridiculous chain
reactions — physics as spectacle, not stat-bar combat. Product design authority:
`design/GDD_2_0.md`. Player-facing basics and controls: root `README.md`.

## How it works in one paragraph

A flat `GameState`, an event bus, and a registry of systems (`init(ctx)` + `update(dt, state)`) run
in a 60 Hz fixed-timestep simulation decoupled from rendering. Sim code never imports Three.js and
uses `state.rng`/`state.simTime` (never wall time or ambient randomness) so runs are reproducible
against `test/*.expected.json` goldens. Rendering (`src/render/`), DOM UI (`src/ui/`), audio, and
save are separate layers; content is data-driven from `src/data/`; ships are release-authored GLB
parts under `assets/ships/`. Browser (`node server.js` → localhost:8123) and Electron are shells of
the same route. The full contract is `ARCHITECTURE.md`.

## Repository map

Enter a directory through its `AGENTS.md`/`README.md`, not by listing it.

| Path | What lives there |
|---|---|
| `src/` | The game. Enter a folder through its `AGENTS.md` (every top-level owner has one; `law/` and `physicalCargo/` are covered by `src/missions/AGENTS.md`). `core/` state and the loop facade, `runtime/` the live init/update/clock manifest, `systems/` fixed-step systems, `ai/` + `combat/` shared libraries, `data/` pure catalogs, `render/` Three.js, `ui/` DOM screens, plus audio, save, presentation, story, world, and `testing/lab/`. Code questions: `MODULE_MAP.md` finds the owner. |
| `assets/` | Authored GLB ships/places/props, portraits, concept art, works. Pipeline rules in `assets/AGENTS.md`; ships in `assets/ships/AGENTS.md`. Evidence subfolders are historical. |
| `design/` | Product and program authority: `GDD_2_0.md`, `VISION.md`, perf docs, plan suites (`spec2/ spec3/ revamp/ vision/ graphics-sprints/`, …). Big — enter via a link, never by sweeping. |
| `design/program/` | Active game-finishing work is routed by `finish/README.md` and its three lane boards; other program plans, `NOW.md`, queues and receipts remain detail/status references as each program directs. | The only whole-program status surface: verified-done / remaining-work split, roadmap queue + active packets, `NOW.md` lock board. Enter via `design/program/README.md`. |
| `docs/` | Engineering navigation (this file, `MODULE_MAP.md`, `COMMON_BUGS.md`, `VALIDATION_WORKFLOW.md`), generated indexes, policy, worldbuilding, `handoffs/` (history only), `agentic-development/` (fleet-orchestration design; informative layer, not authority). See `docs/README.md`. |
| `scripts/` | Node checks, `program-dispatch.mjs`, `build:indexes`. 500+ npm scripts live in `package.json`. |
| `test/` | Sim golden files (`*.expected.json` — never edit to pass) and tests. |
| `tools/`, `styles/`, `electron/`, `schemas/` | Tooling, CSS theme, desktop shell, JSON schemas. Each small; `styles/` and `tools/` have `AGENTS.md`. |
| `vendor/`, `third_party/` | Vendored Three.js and reference ledgers. |
| `review/` | Durable residue of the 2026-08 whole-game review. `review/README.md` is the entry; treat leads as hints. |
| `proto/` | Station redesign spikes. |
| `build/`, `dist/`, `node_modules/` | Build output and dependencies. Never authority, never search. |
| `.campaign/ .devshots/ terminals/ agent-tools/ scratch/ .tmp*/ .grok-scratch/ .serena/ .claude/ .codex/ .cursor/` | Agent/tool residue, captures, transcripts. Never search by default (`docs/SEARCH_CONTEXT.md` lists the exact exclusions). Exception: `.grok/skills/spaceface-blender-material-truth/` is routed from the front door for Blender work. |

Root files beyond the front door: `ARCHITECTURE.md` (technical contract) · `build_map.md`
(program map) · `SAVE_SCHEMA.md` (generated) · `needed-assets.md` (active coverage inventory) ·
`MASSLINE_PHYSICS_HANDOFF.md` (design handoff, high latitude) · `GOAL_PROMPT.txt` (retired
legacy — do not execute).

## Reading ladder

| Depth | Read | Cost |
|---|---|---|
| Always loaded | root `AGENTS.md` — law, coordination, contracts | small |
| First sit-down | this file, then root `README.md` (product basics) and `docs/README.md` (doc routing) | small |
| Named campaign / symptom | [`TASK_ROUTER.md`](./TASK_ROUTER.md) | small |
| By task | `ARCHITECTURE.md` sections, `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, the routed plan/spec | medium — read sections, not whole files |
| Program work | `build_map.md` sections + `design/program/README.md` | large — see route below |

**The big files are section-addressable — do not read them whole.**

- `ARCHITECTURE.md`: §0 global conventions · §1 tech stack · §2 game loop · §3 GameState schema ·
  §4 system interface contract · §5 UI screen management · §6 file manifest · §7 cross-system
  invariants.
- `build_map.md`: §1 start-here doors · §2 product north star · §3 authority · §4 control
  surfaces · §5 selecting work · §6 implementation posture · §7 verification · §8 performance
  (§8.2 option space, §8.4 hitch campaign) · §11 frontend strategy · §12–§13B admitted campaigns
  (Crucible, arcade VFX, flight convergence, authored-asset fielding) · §14 fleet orchestration law.
- `design/GDD_2_0.md`: §1 pitch · §2 core product challenge · §3 design pillars, then per-system
  chapters (§4 flight, §5 mining, §6 combat, §7 information layer, §8 onboarding, §9 visuals,
  §10 performance, §11 economy, §13 success criteria).

## Route for planning / direction work

For active game-finishing work, start with `design/program/finish/README.md`, then take the next row
on the relevant Lane 1, 2, or 3 board. The board owns current order and status; the README explains
path ownership, shared protocol, and finish criteria. Build-map rows named by a board remain the
implementation detail. Do not use the legacy program dispatcher to choose a competing assignment.

For product direction outside that active assignment, read `design/VISION.md` and the relevant
`design/GDD_2_0.md` sections. `design/program/NOW.md` and checkpoint/liveness tools describe current
claims and stale ownership; use them to preserve concurrent work, not to replace the active board.
## Route for answering questions about the repo

Who owns X? → `docs/MODULE_MAP.md` · Why does Y break? → `docs/COMMON_BUGS.md` · What runs when? →
generated `docs/SYSTEM_REGISTRY.md` / `docs/EVENT_ROUTING.md` · Where may I search? →
`docs/SEARCH_CONTEXT.md` (the exclusion list is the token-saver) · What may direct me? →
`docs/POLICY_MANIFEST.md`.
