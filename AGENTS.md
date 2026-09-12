<!-- LIFETIME: STABLE -->
# SpaceFace agent orientation

SpaceFace is a Three.js browser/Electron top-down space game — fly, mine, trade, fight, upgrade, and
build passive income in a living 2.5D universe. Technically: a flat `GameState`, an event bus, and a
registry of systems on a 60 Hz fixed-timestep sim decoupled from rendering. New to the repo? Read
[`docs/ORIENTATION.md`](./docs/ORIENTATION.md). [`build_map.md`](./build_map.md)
is the single program map.

**Never stop halfway.** The owner does not read code and cannot complete leftover agent work. Finish
the named outcome of the job you were given, then stop. Full working agreement:
[`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md). Named-task index:
[`docs/TASK_ROUTER.md`](./docs/TASK_ROUTER.md).

## 1. Start by task

| Task | Start here |
|---|---|
| **No instruction, "next", "go", or "make it better"** | **`build_map.md` §1** — `node scripts/program-dispatch.mjs --next` |
| Program map, "next N" / "what next" | **`build_map.md`**, then `design/program/NOW.md` |
| Occupied now? | `design/program/NOW.md` + `node scripts/check-now-liveness.mjs` |
| Implement a feature/fix | `docs/MODULE_MAP.md` → nearest nested `AGENTS.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Player-facing graphics / Blender/GLB | `docs/visual-assets/README.md` → `assets/AGENTS.md` |
| UI/HUD / frontend looks cheap / make the UI A-list / any menu, HUD or screen redesign | **`design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`** (2026-09-10; frames under `design/frontend/direction/approved/` outrank prose) → `--id PQ-194`; five development sessions `design/frontend/direction/sessions/` (phase specs under `packets/`) → then `src/ui/AGENTS.md`, `styles/AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Finish the game / it still looks unfinished / run the fleet | **`design/program/FINISH_THE_GAME.md`** — goal prompt `design/program/FINISH_THE_GAME_GOAL.txt` |
| Tests/checks | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` |

Campaign, feel, hitch, remaster, harvest, and other named doors:
[`docs/TASK_ROUTER.md`](./docs/TASK_ROUTER.md). Do not sweep `design/`, `.campaign/`, assets,
transcripts, or screenshots for an ordinary code task. Use the nearest nested `AGENTS.md`; do not
copy it into another instruction layer. Do not load vendored `skills/` (not policy).

## 2. Architecture in one paragraph

A flat `GameState`, event bus, and registry of systems run in a 60 Hz fixed-timestep simulation
decoupled from rendering. Sim code stays independent of Three.js, uses the XZ plane, and uses
`state.rng`/`state.simTime` rather than ambient randomness or wall time. Browser and Electron launch
the same game route. See `ARCHITECTURE.md` for the contract.

## 3. Preserve the shared working tree

The working tree may contain valuable concurrent work that is newer than `HEAD`.

- Inspect `git status --short` and `git diff -- <owner-file>` before diagnosing or editing.
- Ownership is **exact and current**. A path is protected when it is dirty/untracked foreign work, or
  when a current-date `NOW.md` row names that exact path and its checkpoint is fresh. A legacy row
  without a checkpoint uses the 90-minute path-mtime fallback. A lane label, mutex, old branch,
  worktree, or pre-today claim alone is not a blocker.
- If other agents are live in the tree (or the task will span sessions), drop a checkpoint row:
  `node scripts/agent-checkpoint.mjs start` with exact paths and a short todo list; release it when
  mutation stops. For an ordinary unit a clear pathspec commit is enough — the checkpoint ceremony
  is optional; the preservation rules below are not.
- A stale checkpoint (90+ minutes without progress, `node scripts/check-now-liveness.mjs`) is
  adoptable: inspect and preserve the existing diff, continue the same work; never start a parallel
  implementation or revert a foreign hunk because the writer left.
- If only part of a packet overlaps protected paths, split and continue the disjoint work. Do not
  turn one exact-path collision into ownership of a subsystem, packet, or plan.
- Never run destructive tree-wide `reset`, `restore`, `checkout`, `clean`, or `stash`. Preserve
  unrelated edits. `git add -N` new files immediately. Stay on the current branch unless the user
  asked to switch. Push only the owned branch by explicit name. Commit finished owned files as you
  go — do not wait for blanket authorization.

Detail: [`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md).

## 4. Authority and current work

When sources disagree: user direction → `ARCHITECTURE.md` (technical) → `design/VISION.md`
(the owner's fantasy and UVP — wins on product emphasis) → `design/GDD_2_0.md` → `design/program/` →
the activated plan/spec → supporting references. [`docs/POLICY_MANIFEST.md`](./docs/POLICY_MANIFEST.md)
says which files may direct an agent.

Live code, current checks, and player-route evidence determine whether descriptive claims are true.

For a user-authorized multi-plan campaign: skip a blocked unit and continue other safe work; an empty
ready queue is not completion; missing local code, manifests, checks, or packet files are work, not
external blockers. Status/receipt/harness-only work is not a production outcome unless the user asked
for those artifacts.

No human verdict is an execution gate. Older `NEEDS HUMAN` / `owner verdict` / `human review` wording
means an independent agent review against the named evidence. Only an explicit external action the
user requested may remain deferred.

## 5. Live runtime selection

| Slot | Live | Compatibility path |
|---|---|---|
| Flight | `src/systems/flightV3.js` + `src/core/flight/` | `flight.js` / `flightDynamics.js` |
| AI | `src/systems/tacticalAI.js` + `src/ai/` + `aiPorts.js` | `ai.js` |
| Physics | `rapier-dynamic` via physics authority | custom legacy backend |

Compatibility files remain imported and tested; do not edit them for default gameplay fixes or delete
them casually. Confirm selection in `src/core/registry.js` and defaults in `src/core/gameState.js`.

## 6. Hard engineering contracts

- **One game path:** browser, Electron, probes, and packaged builds share gameplay, assets, settings,
  and entrypoint. Launcher wrappers own shell concerns only.
- **Determinism:** never edit `test/*.expected.json` merely to pass. Sim uses `state.rng` and
  `state.simTime`; cosmetic render/VFX randomness is separate.
- **Single writers:** economy→credits, factions→reputation/sector ownership, cargo→cargo,
  ships→derived stats, heat→WANTED heat. Other systems emit intents/events.
- **Input contract:** preserve raw axes and `state.input.actions` semantics. Editing
  `src/systems/input.js` needs task ownership plus focused input/rebind/sim validation.
- **Wired features:** player-facing work must be reachable on the default route. A local candidate,
  report, or hidden flag is not completion.
- **Assets:** exact manifests, release metadata, and runtime maps outrank prose inventories.
  Historical lane documents are not permanent ownership.
- **Visual craft:** start at `docs/visual-assets/README.md` and
  `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`. VFX also obeys
  `VFX_TECHNIQUE_STANDARD.md`. A camera-facing soft square/disc is never a designed object — distant
  background stars are the only exception, and only while tiny, bright, and at sky depth. Blender/GLB
  work must complete the material-truth **preflight** in
  `.grok/skills/spaceface-blender-material-truth/SKILL.md`. Tier A/B uses component-level records. A
  technical receipt cannot close G1/G2/G4; a **component-scoped** pass never implies a **whole-asset**
  pass; missing hash-bound visual review keeps the gate open.
- **Performance:** optimize algorithms, allocation, batching, cadence, culling, residency, and frame
  pacing. Do not pass gates by removing authored visuals or lowering default quality.
- **Accessibility:** preserve input reachability, reduced-motion/flash behavior, legibility, and
  contrast. Accessibility does not require a universal visual style.
- **Dependencies/media:** allowed when they materially improve quality and their bundle/performance,
  determinism/save, and maintenance effects are understood.

## 8. System update order

`src/core/registry.js` is the source. Generated `docs/SYSTEM_REGISTRY.md` explains system and render
order; do not copy the list into policy files.

## 9. Verification router

Run the checks the change actually needs. Fast gate first; do not loop on verification rituals.

| You want | Run |
|---|---|
| Quick sanity pass | `npm run check:baseline` (~15s) — run it when the change could plausibly break something it touches; judgment, not ritual |
| What the running game is actually doing (freeze, hitch, "why is it slow") | `npm run probe:runtime-witness`, then read `.devshots/runtime-witness/report.md` |
| Broad sweep | `npm run check:all` (not `check` — a fail-fast chain that hides failures) |
| Middle tier | `npm run check:all:smoke` |

`check:baseline --list` shows coverage; `--only=a,b` runs a subset. Do not re-record
`test/*.expected.json` goldens just to pass. A moving sim clock is not a live 3D picture — freeze and
perf work starts at the runtime witness. Do not rerun the same command against the same candidate
after the same failure fingerprint without a relevant change.

Full ladder: [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md).

## 11. Depth docs (read by need, not by default)

| File | What it holds |
|---|---|
| [`docs/ORIENTATION.md`](./docs/ORIENTATION.md) | Repo map, reading ladder, planner route |
| [`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md) | Finish-the-job, concurrent agents, `NOW.md`, worktrees, `check:playable`, reporting |
| [`docs/AGENT_LESSONS.md`](./docs/AGENT_LESSONS.md) | Owner preferences and verified workspace facts |
| [`docs/POLICY_MANIFEST.md`](./docs/POLICY_MANIFEST.md) | Which files may direct an agent |
| [`docs/TASK_ROUTER.md`](./docs/TASK_ROUTER.md) | Named campaign / symptom doors |
