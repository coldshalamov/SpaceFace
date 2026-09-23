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
| Long-horizon VM / Blender / cloud agent work | **`design/program/VM_LANES.md`** |
| Implement a feature/fix | `docs/MODULE_MAP.md` → nearest nested `AGENTS.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Player-facing graphics / Blender/GLB | `docs/visual-assets/README.md` → `assets/AGENTS.md` |
| UI/HUD / frontend looks cheap / make the UI A-list / any menu, HUD or screen redesign | **`docs/UI_VISUAL_ITERATION.md`** — the frontend iteration system. Shoot the real screen over a still (`node scripts/ui-bench.mjs --shot=<id>`), open that PNG yourself, fix what you see, and `--walk` every control on the screens you changed before you call them done. Do not leave stills for a later pass. **Direction: [`design/frontend/ORRERY.md`](design/frontend/ORRERY.md) (owner, 2026-09-22 late) — the one plan for the whole interface: an instrument of light, the Hand, the ORRERY library in `src/ui/orrery/`; screens compose library elements and never hand-roll boxes.** It supersedes FIELD_HARDWARE_PROGRAM, ONE_PHOTOGRAPH and "printed and lit" as direction (their no-material-imitation law stays). Then `src/ui/AGENTS.md` and `styles/AGENTS.md`. **OWNER RULING 2026-09-18:** nothing under `design/frontend/direction/approved/` carries owner authority. The bar: *consistent, high-detail, creative, interactive, non-generic — and the live game currently reads cheap.* The picture you opened is the evidence. |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Saw a defect that is not your task | **§7 total-fix mode** — small: fix it now; medium: call a subagent; otherwise one row in the demo defect ledger |
| INFERENCE / make N missions / throw an agent at the game | copy [`design/program/INFERENCE_GOAL.txt`](design/program/INFERENCE_GOAL.txt). An OPEN line in [`design/program/INFERENCE_IDEAS.md`](design/program/INFERENCE_IDEAS.md) is the assignment. Look, infer, rotate only when that catalog is empty. Detect is a hint, not the task. Law: [`design/program/INFERENCE_LANES.md`](design/program/INFERENCE_LANES.md). Open feelings for a strong pass: `build_map.md` §23 |
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
  go - do not wait for blanket authorization.
- **Commit with exact paths.** `git add -A` and `git commit -a` sweep other lanes' half-finished
  work into your commit; stage only what you changed (`git add -- <paths>`). If a sweep already
  happened, name it in the commit body instead of unpicking it.
- **Publish partial work with pathspecs, never from a snapshot.** `git add -- <paths>` and then
  `git commit -m "..." -- <paths>`: a pathspec commit takes those paths as they are at commit time.
  Snapshot flows (an alternate `GIT_INDEX_FILE`, a filtered patch, `read-tree`) are race hazards:
  when `HEAD` moves between the snapshot and the commit, the commit's tree is the old snapshot, so
  it silently *reverts* every file that landed in between. That happened on 2026-09-16 - a
  temp-index commit reverted seven other-lane files; the worktree kept them, so one publish repaired
  it, but the history is scarred.
- **Read `git show --stat HEAD` after every partial commit, before walking away.** A file you never
  touched in that list is such a revert: restore it from the pre-commit revision in the same turn.
  The matching index symptom: `git status --short` shows `D ` staged for a file that exists in
  `HEAD` and on disk, next to `??` for the same path - that is a stale index, repaired with
  `git reset -- <paths>`, never published from.
- **A collision is repaired by content, not by winning.** If your landed hunk is overwritten or
  reverted, re-land the content additively; if your own change breaks the app (a bad import, a red
  core path), fix it or revert your own hunk in the same turn. Awareness of other lanes is
  background, never permission: a live row on paths you are not editing blocks nothing.

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
- **Dependencies/media:** the outside resources that would make this game better are named in
  [`docs/OPEN_SOURCE_INTAKE.md`](./docs/OPEN_SOURCE_INTAKE.md) §0. Use that list. Record license,
  bundle, performance, determinism/save, and maintenance. Do not copy Unreal Engine code. A
  catalog line does not add a package.

## 7. Total-fix mode (owner, 2026-09-22)

A demo beta is due. Until it ships, the game must be a working thing with no obvious bugs, and
every agent is in total-fix mode. A defect seen and brushed past because "not my task" is a defect
the next session may pay hours to isolate — or never see again. The sitting that sees a bug owns
getting it handled; the task does not have to own fixing it.

- **Small** (one cause, minutes): fix it now, in this session, alongside your named task.
- **Medium** (multi-file, or fixing it inline would convolute the unit): call a subagent to fix it
  while you continue. Do not stop your named outcome for it.
- **Big or cause unknown:** add ONE row to the demo defect ledger —
  [`design/program/DEMO_READINESS_2026-09-20.md`](./design/program/DEMO_READINESS_2026-09-20.md)
  §6 — then move on. Never open a second bug list elsewhere; a defect that is neither fixed nor
  logged is the one unacceptable outcome.
- **Ledger hygiene is the law:** a row leaves the ledger only by being fixed — delete it in the
  fixing commit; never strike it through, mark it done, or archive it. Any sitting may claim any
  row, and a sitting dispatched into files that carry an open row handles that row as part of its
  unit. The ledger must stay readable in one minute: if it grows past a screen, clearing rows
  outranks taking new queue units.

## 8. System update order

`src/core/registry.js` is the source. Generated `docs/SYSTEM_REGISTRY.md` explains system and render
order; do not copy the list into policy files.

## 9. Verification router

Run the checks the change actually needs. Fast gate first; do not loop on verification rituals.

| You want | Run |
|---|---|
| Quick sanity pass | `npm run check:baseline` (~15s) — run it when the change could plausibly break something it touches; judgment, not ritual |
| What the running game is actually doing (freeze, hitch, "why is it slow") | `npm run probe:runtime-witness`, then read `.devshots/runtime-witness/report.md` |
| A gameplay, feel, or content claim | The live owner plus a fixed-seed number or focused test. Do not capture to review. Owner ruling: `docs/AGENT_LESSONS.md` |
| A session-SHAPE claim (encounter pacing, spawn policy, economy phases, director cadence, law wiring) that no focused fixture can express | ONE targeted playthrough session: one archetype, one seed, hours capped to the affected window (default 3). Multi-session batteries are L4 diagnostic instruments — never a routine gate. `docs/VALIDATION_WORKFLOW.md` |
| Broad sweep | `npm run check:all` (not `check` — a fail-fast chain that hides failures) |
| Middle tier | `npm run check:all:smoke` |

`check:baseline --list` shows coverage; `--only=a,b` runs a subset. Do not re-record
`test/*.expected.json` goldens just to pass. A moving sim clock is not a live 3D picture — freeze and
perf work starts at the runtime witness. Do not rerun the same command against the same candidate
after the same failure fingerprint without a relevant change.

Browser test servers must set `SPACEFACE_PLAYER_STORE_DIR=''` explicitly, or use
`createGameServer` without `playerStoreDir`. An unset variable mounts the real shared save drawer;
a fresh browser profile or alternate port alone does not isolate player saves.

Full ladder: [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md).

## 11. Depth docs (read by need, not by default)

| File | What it holds |
|---|---|
| [`docs/ORIENTATION.md`](./docs/ORIENTATION.md) | Repo map, reading ladder, planner route |
| [`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md) | Finish-the-job, concurrent agents, `NOW.md`, worktrees, `check:playable`, reporting |
| [`docs/AGENT_LESSONS.md`](./docs/AGENT_LESSONS.md) | Owner preferences and verified workspace facts |
| [`docs/POLICY_MANIFEST.md`](./docs/POLICY_MANIFEST.md) | Which files may direct an agent |
| [`docs/TASK_ROUTER.md`](./docs/TASK_ROUTER.md) | Named campaign / symptom doors |

## 12. Owner feel decision

On 2026-09-15 the owner explicitly chose **gradually come to rest** for hands-off assisted flight.
Keep the newer proportional settle-to-rest behavior and the separate deliberate brake. This
supersedes the dated gap report's earlier requirement to retain at least 90 WU/s ten seconds after
releasing at 95 WU/s; do not restore that old target as a regression fix. Newtonian-mode and
above-cap earned-momentum contracts remain separate.

## 13. Owner capture decision

On 2026-09-16 the owner ruled that capture requirements had slowed production to a crawl.
Agents review by reading the live owner and investigating; they do not make headed stills the
proof. Default close is a number from a fixed-seed scenario or a focused test. A still is
optional, in-session, deleted, and only for a purely visual claim. GPU/Chromium failure never
blocks `implemented`. Detail: [`docs/AGENT_LESSONS.md`](./docs/AGENT_LESSONS.md). Craft:
[`build_map.md`](./build_map.md) §1.3.2.
