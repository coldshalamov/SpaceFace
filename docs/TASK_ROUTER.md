<!-- LIFETIME: STABLE -->
# Named-task router

Read this when the job is a **named campaign, symptom, or specialty door** — not for an ordinary
code fix. Root [`../AGENTS.md`](../AGENTS.md) stays small; [`../CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md)
is the single program map. Campaign laws that must not drift live in the map's §1B, not here.

Do not sweep `design/`, `.campaign/`, assets, transcripts, or screenshots for an ordinary code task.

| Task | Start here |
|---|---|
| No instruction, "next", "go", or "make it better" | **`CANONICAL_BUILD_MAP.md` §1** — `node scripts/program-dispatch.mjs --next`, read the packet's "How agents get this wrong", finish the unit to its done-when in player units, report in §1.4 words, take the next |
| Program map, "next N" / "what next" / multi-plan work, check-off, plan routing | **`CANONICAL_BUILD_MAP.md`**, then `design/program/NOW.md` + queue |
| Same-picture performance option, investigation, or large port later | **`CANONICAL_BUILD_MAP.md` §8.2** → [`../design/PERF_OPTION_SPACE.md`](../design/PERF_OPTION_SPACE.md) |
| Hitching / stuttering / not playing smoothly | **`CANONICAL_BUILD_MAP.md` §8.4** → [`../design/program/PERF_HITCH_CAMPAIGN.md`](../design/program/PERF_HITCH_CAMPAIGN.md) → `PQ-129`. Measure first; do not cut quality |
| Combat and flight feel wonky / "agents keep adding content instead of fixing the feel" | **`CANONICAL_BUILD_MAP.md` §13C** → [`../design/FEEL_CONTRACT.md`](../design/FEEL_CONTRACT.md) → `PQ-137`. Answer with a bar and the number that moved, never with more content |
| "Make it better" / it sucks / it's not fun | [`../design/program/FUN_CONVERGENCE_LOOP.md`](../design/program/FUN_CONVERGENCE_LOOP.md) → copy `design/program/FUN_CONVERGENCE_GOAL.txt`. Play the bench on fixed seeds, name the ONE fundamental, fix the guts, show the number and the frames. Crucible first; never answer with content |
| Finish the game / what is next for release / the professional bar | **`CANONICAL_BUILD_MAP.md` §15** → `--id PQ-146` or any §15.2 ID; the eight reactivated packets `PQ-026`–`PQ-033` are ready again |
| Independent pass over what just landed / taste, improvements, and bugs before those units are finished | **`CANONICAL_BUILD_MAP.md` §1.7** → `--id PQ-191`. Play the named surfaces; fix real defects; a report with leftovers still on camera is not done |
| What is active or occupied now? | `design/program/NOW.md` + `node scripts/check-now-liveness.mjs` → `design/program/README.md` |
| Claim a multi-week roadmap packet | `design/program/roadmap/README.md` → `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Implement a feature/fix | Activated plan/spec → `docs/MODULE_MAP.md` → owning nested `AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Event or update-order trace | Generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Any player-facing graphics or visual asset | **`docs/visual-assets/README.md` first**, then `assets/AGENTS.md` or the owning runtime/UI route it names |
| Ship, station, place, prop, or other Blender/GLB form or surfacing work | `assets/ships/AGENTS.md` **and** `.grok/skills/spaceface-blender-material-truth/SKILL.md` |
| Resolve the current starter/player ship before graphics work | `src/data/newGameDefaults.js` → ship/root maps in `src/render/partsLibrary.js`; never infer from a screenshot or legacy filename |
| Resume dock/hulk/debris place remaster (Blender/EEVEE) | **`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`** (also linked from `CANONICAL_BUILD_MAP.md` §1) |
| Harvest leftover worktrees / unused models into the live game | **`design/program/ORPHAN_HARVEST_GOAL.txt`** → [`ORPHAN_HARVEST_PLAYBOOK.md`](../design/program/ORPHAN_HARVEST_PLAYBOOK.md) + [`ORPHAN_HARVEST_LEDGER.md`](../design/program/ORPHAN_HARVEST_LEDGER.md) |
| Resume non-Hitch flyable ship remaster (not Hitch) | **`CANONICAL_BUILD_MAP.md`** campaign door → `PQ-050` / [`PQ-050.md`](../design/program/roadmap/active/PQ-050.md) |
| NPC ships look like another game / floating parts / reverse jets are needles | **`design/program/VISUAL_WORLD_CLEANUP.md`** (prompt: [`VISUAL_WORLD_CLEANUP_GOAL.txt`](../design/program/VISUAL_WORLD_CLEANUP_GOAL.txt)). Taste model; do not over-specify the look. Hitch stays frozen. |
| Add a map-visible place (planet, station, route, region) | `src/data/PLACE_REGISTRATION.md` — **not done until `npm run check:atlas-integrity` is green** |
| Frontend looks cheap / make the UI A-list / any menu, HUD or screen redesign | **`design/FRONTEND_DIRECTION.md`** → `--id PQ-187`. Authority: [`DIRECTION_SHEET.md`](../design/frontend/direction/DIRECTION_SHEET.md); kit then title live (`PQ-187.02` / `.03`) gates every surface packet; spec [`KIT_SPEC.md`](../design/frontend/direction/KIT_SPEC.md); handoff [`HANDOFF_PROMPTS.md`](../design/frontend/direction/HANDOFF_PROMPTS.md) |
| UI/HUD | `src/ui/AGENTS.md` and `styles/AGENTS.md` |
| Asteroid Works / mining minigame unreadable or undrivable | **`CANONICAL_BUILD_MAP.md`** door → [`ASTEROID_WORKS_PLAYFIELD.md`](../design/program/ASTEROID_WORKS_PLAYFIELD.md) → `PQ-130` |
| Flight HUD attention pass (quiet instruments, receipts, no windshield keys) | **`design/HUD_FLIGHT_ATTENTION.md`** (goal prompt: `design/HUD_FLIGHT_ATTENTION_GOAL.txt`) |
| Render/performance | `src/render/AGENTS.md` and `design/PERF_BUDGET.md` |
| Feature validation, deterministic lab, Browser/Electron acceptance | `docs/VALIDATION_WORKFLOW.md` → `src/testing/lab/AGENTS.md` when changing the lab |
| Tests/checks/tooling | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` |
| Search/archaeology | `docs/SEARCH_CONTEXT.md` |
| Leftover `sf-*` / agent worktree cleanup, integrate-or-drop triage | **`design/program/WORKTREE_RECOVERY.md`** — exact current ownership only; never delete a ref or clone until its cleanup gate is durable |

Vendored [`../skills/`](../skills/README.md) is generic third-party kit, not SpaceFace policy. Do not
load it. Blender/GLB work uses `.grok/skills/spaceface-blender-material-truth/SKILL.md`.
