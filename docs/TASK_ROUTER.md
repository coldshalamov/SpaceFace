<!-- LIFETIME: STABLE -->
# Named-task router

Read this when the job is a **named campaign, symptom, or specialty door** — not for an ordinary
code fix. Root [`../AGENTS.md`](../AGENTS.md) stays small; [`../build_map.md`](../build_map.md)
is the single program map. Campaign laws that must not drift live in the map's §1B, not here.

Do not sweep `design/`, `.campaign/`, assets, transcripts, or screenshots for an ordinary code task.

| Task | Start here |
|---|---|
| No instruction, "next", "go", or "make it better" | **`build_map.md` §1** — `node scripts/program-dispatch.mjs --next`, read the packet's "How agents get this wrong", finish the unit to its done-when in player units, report in §1.4 words, take the next |
| Program map, "next N" / "what next" / multi-plan work, check-off, plan routing | **`build_map.md`**, then `design/program/NOW.md` + queue |
| Same-picture performance option, investigation, or large port later | **`build_map.md` §8.2** → [`../design/PERF_OPTION_SPACE.md`](../design/PERF_OPTION_SPACE.md) |
| Hitching / stuttering / not playing smoothly / low FPS | [`../design/perf/TABLE_AUTHORITY_PLAN.md`](../design/perf/TABLE_AUTHORITY_PLAN.md) + prompt [`../design/program/TABLE_AUTHORITY_GOAL.txt`](../design/program/TABLE_AUTHORITY_GOAL.txt). Parent spawns lane subagents. Do **not** start from “sleep 317 Rapier bodies” or another hitch catalog |
| Combat and flight feel wonky / "agents keep adding content instead of fixing the feel" | **`build_map.md` §13C** → [`../design/FEEL_CONTRACT.md`](../design/FEEL_CONTRACT.md) → `PQ-137`. Answer with a bar and the number that moved, never with more content |
| "Make it better" / it sucks / it's not fun | [`../design/program/FUN_CONVERGENCE_LOOP.md`](../design/program/FUN_CONVERGENCE_LOOP.md) → copy `design/program/FUN_CONVERGENCE_GOAL.txt`. Play the bench on fixed seeds, name the ONE fundamental, fix the guts, show the number and the frames. Crucible first; never answer with content |
| Finish the game / it still looks unfinished / run the fleet | **`design/program/FINISH_THE_GAME.md`** (goal: `design/program/FINISH_THE_GAME_GOAL.txt`). Queue still `--ready`; player-visible cheap/hitch/toys still count. Fleet: [`FLEET_COMMAND_STRUCTURE.md`](../docs/agentic-development/FLEET_COMMAND_STRUCTURE.md) |
| What is next for release / the professional bar (packet sequence only) | **`build_map.md` §15** → `--id PQ-146` or any §15.2 ID; the eight reactivated packets `PQ-026`–`PQ-033` are ready again |
| Independent pass over what just landed / taste, improvements, and bugs | **`build_map.md` §1.7** — play the named surfaces yourself, fix real defects, report in §1.4 words. No standing review queue |
| What is active or occupied now? | `design/program/NOW.md` + `node scripts/check-now-liveness.mjs` → `design/program/README.md` |
| Claim a multi-week roadmap packet | `design/program/roadmap/README.md` → `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Implement a feature/fix | Activated plan/spec → `docs/MODULE_MAP.md` → owning nested `AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Event or update-order trace | Generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Any player-facing graphics or visual asset | **`docs/visual-assets/README.md` first**, then `assets/AGENTS.md` or the owning runtime/UI route it names |
| Ship, station, place, prop, or other Blender/GLB form or surfacing work | `assets/ships/AGENTS.md` **and** `.grok/skills/spaceface-blender-material-truth/SKILL.md` |
| Resolve the current starter/player ship before graphics work | `src/data/newGameDefaults.js` → ship/root maps in `src/render/partsLibrary.js`; never infer from a screenshot or legacy filename |
| Resume dock/hulk/debris place remaster (Blender/EEVEE) | **`build_map.md` §13D** → `--id PQ-193` leaf `.10` (handoff: `assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`) |
| 3D looks broken / unused models / ships don't render / missing pieces | **`build_map.md` §13D** → `--id PQ-193` |
| Ships pop in late / box then ship / blank lock / LOD / “shave a little” | [`DYNAMIC_GRAPHICS_INVESTIGATION.md`](../design/program/DYNAMIC_GRAPHICS_INVESTIGATION.md). First production: `--id PQ-193` leaf `.00`. Do not start an impostor or cheaper-hull campaign. |
| Audit all 3D models / inventory the shelf / plan A-list quality from what we have | **`design/program/MODEL_STOCKTAKE_GOAL.txt`** (law: [`MODEL_STOCKTAKE.md`](../design/program/MODEL_STOCKTAKE.md)). Research and a plan. Do not model. Folds into §13D / `PQ-193`, not a second queue |
| Harvest leftover worktrees / unused models into the live game | **`design/program/ORPHAN_HARVEST_GOAL.txt`** → [`ORPHAN_HARVEST_PLAYBOOK.md`](../design/program/ORPHAN_HARVEST_PLAYBOOK.md) + [`ORPHAN_HARVEST_LEDGER.md`](../design/program/ORPHAN_HARVEST_LEDGER.md) |
| Resume non-Hitch flyable ship remaster (not Hitch) | **`build_map.md` §13D Wave C** → `PQ-050` / [`PQ-050.md`](../design/program/roadmap/active/PQ-050.md) |
| NPC ships look like another game / floating parts / reverse jets are needles | **`build_map.md` §13D** → `--id PQ-193` leaves `.01` / `.02`. Law: [`VISUAL_WORLD_CLEANUP.md`](../design/program/VISUAL_WORLD_CLEANUP.md) |
| Add a map-visible place (planet, station, route, region) | `src/data/PLACE_REGISTRATION.md` — **not done until `npm run check:atlas-integrity` is green** |
| Frontend looks cheap / make the UI A-list / any menu, HUD or screen redesign | **`design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`** → `--id PQ-194`. Frames under `design/frontend/direction/approved/` outrank every prose doc; five development sessions under `design/frontend/direction/sessions/` (`node scripts/build-ui-packet.mjs S1`) built from 28 phase specs under `packets/`. `PQ-187` / Cinematic Minimal is superseded |
| UI/HUD | `src/ui/AGENTS.md` and `styles/AGENTS.md` |
| Asteroid Works / mining minigame unreadable or undrivable | **`build_map.md`** door → [`ASTEROID_WORKS_PLAYFIELD.md`](../design/program/ASTEROID_WORKS_PLAYFIELD.md) → `PQ-130` |
| Flight HUD attention pass (quiet instruments, receipts, no windshield keys) | **`design/HUD_FLIGHT_ATTENTION.md`** (goal prompt: `design/HUD_FLIGHT_ATTENTION_GOAL.txt`) |
| Render/performance | `src/render/AGENTS.md` and `design/PERF_BUDGET.md` |
| Feature validation, deterministic lab, Browser/Electron acceptance | `docs/VALIDATION_WORKFLOW.md` → `src/testing/lab/AGENTS.md` when changing the lab |
| Tests/checks/tooling | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` |
| Search/archaeology | `docs/SEARCH_CONTEXT.md` |
| Leftover `sf-*` / agent worktree cleanup, integrate-or-drop triage | **`design/program/WORKTREE_RECOVERY.md`** — exact current ownership only; never delete a ref or clone until its cleanup gate is durable |

Vendored [`../skills/`](../skills/README.md) is generic third-party kit, not SpaceFace policy. Do not
load it. Blender/GLB work uses `.grok/skills/spaceface-blender-material-truth/SKILL.md`.
