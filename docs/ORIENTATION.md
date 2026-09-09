<!-- LIFETIME: STABLE -->
# SpaceFace — agent orientation map

The whole repo on one page: what the game is, how it works, where everything lives, and what to read
for your job. Root [`../AGENTS.md`](../AGENTS.md) is the always-loaded front door (law + task
router); this file is the second read, and everything deeper is read by need only. This file holds
no volatile status — status pointers are named, never copied.

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
| `src/` | The game. `core/` state/loop/registry, `systems/` fixed-step systems, `ai/` + `combat/` shared libraries, `data/` pure catalogs, `render/` Three.js layer, `ui/` DOM screens, plus `audio/ save/ presentation/ story/ world/ testing/lab/`. Code questions: `MODULE_MAP.md` finds the owner. |
| `assets/` | Authored GLB ships/places/props, portraits, concept art, works. Pipeline rules in `assets/AGENTS.md`; ships in `assets/ships/AGENTS.md`. Evidence subfolders are historical. |
| `design/` | Product and program authority: `GDD_2_0.md`, `VISION.md`, perf docs, plan suites (`spec2/ spec3/ revamp/ vision/ graphics-sprints/`, …). Big — enter via a link, never by sweeping. |
| `design/program/` | The only whole-program status surface: verified-done / remaining-work split, roadmap queue + active packets, `NOW.md` lock board. Enter via `design/program/README.md`. |
| `docs/` | Engineering navigation (this file, `MODULE_MAP.md`, `COMMON_BUGS.md`, `VALIDATION_WORKFLOW.md`), generated indexes, policy, worldbuilding, `handoffs/` (history only), `agentic-development/` (fleet-orchestration design; informative layer, not authority). See `docs/README.md`. |
| `scripts/` | Node checks, `program-dispatch.mjs`, `build:indexes`. 500+ npm scripts live in `package.json`. |
| `test/` | Sim golden files (`*.expected.json` — never edit to pass) and tests. |
| `tools/`, `styles/`, `electron/`, `schemas/` | Tooling, CSS theme, desktop shell, JSON schemas. Each small; `styles/` and `tools/` have `AGENTS.md`. |
| `vendor/`, `third_party/` | Vendored Three.js and reference ledgers. |
| `review/` | Durable residue of the 2026-08 whole-game review. `review/README.md` is the entry; treat leads as hints. |
| `proto/` | Station redesign spikes. |
| `build/`, `dist/`, `node_modules/` | Build output and dependencies. Never authority, never search. |
| `.campaign/ .devshots/ terminals/ agent-tools/ scratch/ .tmp*/ .grok-scratch/ .serena/ .claude/ .codex/ .cursor/` | Agent/tool residue, captures, transcripts. Never search by default (`docs/SEARCH_CONTEXT.md` lists the exact exclusions). Exception: `.grok/skills/spaceface-blender-material-truth/` is routed from the front door for Blender work. |

Root files beyond the front door: `ARCHITECTURE.md` (technical contract) · `CANONICAL_BUILD_MAP.md`
(program map) · `SAVE_SCHEMA.md` (generated) · `needed-assets.md` (active coverage inventory) ·
`MASSLINE_PHYSICS_HANDOFF.md` (design handoff, high latitude) · `VISUAL_ASSET_PLAN.md` (historical
generation ledger) · `plan.md` / `GOAL_PROMPT.txt` (retired legacy — do not execute).

## Reading ladder

| Depth | Read | Cost |
|---|---|---|
| Always loaded | root `AGENTS.md` — law, router, contracts | small |
| First sit-down | this file, then root `README.md` (product basics) and `docs/README.md` (doc routing) | small |
| By task | `ARCHITECTURE.md` sections, `docs/MODULE_MAP.md`, `docs/COMMON_BUGS.md`, the routed plan/spec | medium — read sections, not whole files |
| Program work | `CANONICAL_BUILD_MAP.md` sections + `design/program/README.md` | large — see route below |

**The big files are section-addressable — do not read them whole.**

- `ARCHITECTURE.md`: §0 global conventions · §1 tech stack · §2 game loop · §3 GameState schema ·
  §4 system interface contract · §5 UI screen management · §6 file manifest · §7 cross-system
  invariants.
- `CANONICAL_BUILD_MAP.md`: §1 start-here doors · §2 product north star · §3 authority · §4 control
  surfaces · §5 selecting work · §6 implementation posture · §7 verification · §8 performance
  (§8.2 option space, §8.4 hitch campaign) · §11 frontend strategy · §12–§13B admitted campaigns
  (Crucible, arcade VFX, flight convergence, authored-asset fielding) · §14 fleet orchestration law.
- `design/GDD_2_0.md`: §1 pitch · §2 core product challenge · §3 design pillars, then per-system
  chapters (§4 flight, §5 mining, §6 combat, §7 information layer, §8 onboarding, §9 visuals,
  §10 performance, §11 economy, §13 success criteria).

## Route for planning / direction work

You were asked to plan where the game goes next. Minimum sufficient reading:

1. Root `AGENTS.md` + this file. You now know the law and the map.
2. Product truth: `design/VISION.md` whole (it is short and outranks other docs on emphasis);
   `design/GDD_2_0.md` §1–§3 for pitch, challenge, pillars.
3. Program truth: `CANONICAL_BUILD_MAP.md` §2 (north star), §4 (the five control surfaces), §5
   (how work is selected and shaped).
4. Current state: `design/program/README.md` (the status door) → its read-by-need table into
   `01_VERIFIED_DONE.md` / `02_REMAINING_WORK.md` / `06_RETAINED_FUTURE_BACKLOG.md` (read
   headings first; they are large). `node scripts/program-dispatch.mjs --ready` shows the
   dependency-front units without reading the raw queue.
5. Live locks: `design/program/NOW.md` — hints about possible collisions only, never a stop
   (`docs/AGENT_OPERATIONS.md` explains why).
6. Constraints on any plan you write: root `AGENTS.md` §4 authority order and §6 contracts;
   `docs/POLICY_MANIFEST.md` conflict order; `docs/AGENT_LESSONS.md` for the owner's verified
   preferences (quality cuts and cheap stand-ins are rejected directions).

Facts for a plan come only from `design/program/`, live code, and current check output — never from
handoffs, reviews, transcripts, or prose that names old state. When a doc and the code disagree,
`git log` says which side moved.

## Route for answering questions about the repo

Who owns X? → `docs/MODULE_MAP.md` · Why does Y break? → `docs/COMMON_BUGS.md` · What runs when? →
generated `docs/SYSTEM_REGISTRY.md` / `docs/EVENT_ROUTING.md` · Where may I search? →
`docs/SEARCH_CONTEXT.md` (the exclusion list is the token-saver) · What may direct me? →
`docs/POLICY_MANIFEST.md`.
