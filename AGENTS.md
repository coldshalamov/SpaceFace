<!-- LIFETIME: STABLE -->
# SpaceFace agent orientation

SpaceFace is a Three.js browser/Electron top-down space game — fly, mine, trade, fight, upgrade, and
build passive income in a living 2.5D universe. Technically: a flat `GameState`, an event bus, and a
registry of systems on a 60 Hz fixed-timestep sim decoupled from rendering. New to the repo? Read
[`docs/ORIENTATION.md`](./docs/ORIENTATION.md) — the whole repo on one page.

**Never stop halfway.** The owner does not read code and cannot complete leftover agent work. Finish
the named outcome of the job you were given, then stop — the full working agreement is
[`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md).

## 1. Start by task

| Task | Start here |
|---|---|
| Program map, "what next" / multi-plan work, check-off, plan routing | **`CANONICAL_BUILD_MAP.md`** (then `design/program/NOW.md` + queue) |
| Every same-picture performance option, investigation, or large port later | **`CANONICAL_BUILD_MAP.md` §8.2** → [`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md) |
| The game is hitching / stuttering / not playing smoothly | **`CANONICAL_BUILD_MAP.md` §8.4** → [`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md) → `PQ-129` (`--id PQ-129`). Measure first; do not cut quality |
| The game is not fun / combat and flight feel wonky / "agents keep adding content instead of fixing the feel" | **`CANONICAL_BUILD_MAP.md` §13C** → [`design/FEEL_CONTRACT.md`](./design/FEEL_CONTRACT.md) → `PQ-137` (`--id PQ-137`). Answer with a bar and the number that moved, never with more content |
| Finish the game / what is next for release / the professional bar | **`CANONICAL_BUILD_MAP.md` §15** (three release milestones with gates) → `--id PQ-146` or any §15.2 ID; the eight reactivated packets `PQ-026`–`PQ-033` are ready again |
| What is active or occupied now? | `design/program/NOW.md` → `design/program/README.md` |
| Claim a multi-week roadmap packet | `design/program/roadmap/README.md` → `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Implement a feature/fix | Activated plan/spec → `docs/MODULE_MAP.md` → owning nested `AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Event or update-order trace | Generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Any player-facing graphics or visual asset | **`docs/visual-assets/README.md` first**, then `assets/AGENTS.md` or the owning runtime/UI route it names |
| Ship, station, place, prop, or other Blender/GLB form or surfacing work | `assets/ships/AGENTS.md` **and** `.grok/skills/spaceface-blender-material-truth/SKILL.md` |
| Resolve the current starter/player ship before graphics work | `src/data/newGameDefaults.js` → ship/root maps in `src/render/partsLibrary.js`; never infer from a screenshot or legacy filename |
| Resume dock/hulk/debris place remaster (Blender/EEVEE) | **`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`** (also linked from `CANONICAL_BUILD_MAP.md` §1) |
| Harvest leftover worktrees / unused models into the live game | **`design/program/ORPHAN_HARVEST_GOAL.txt`** → [`ORPHAN_HARVEST_PLAYBOOK.md`](./design/program/ORPHAN_HARVEST_PLAYBOOK.md) + [`ORPHAN_HARVEST_LEDGER.md`](./design/program/ORPHAN_HARVEST_LEDGER.md) |
| Resume non-Hitch flyable ship remaster (not Hitch) | **`CANONICAL_BUILD_MAP.md`** campaign door → `PQ-050` / [`design/program/roadmap/active/PQ-050.md`](./design/program/roadmap/active/PQ-050.md) |
| Add a map-visible place (planet, station, route, region) | `src/data/PLACE_REGISTRATION.md` — **not done until `npm run check:atlas-integrity` is green** |
| UI/HUD | `src/ui/AGENTS.md` and `styles/AGENTS.md` |
| Asteroid Works / mining minigame unreadable or undrivable | **`CANONICAL_BUILD_MAP.md`** door → [`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md) → `PQ-130` (`--id PQ-130`) |
| Flight HUD attention pass (quiet instruments, receipts, no windshield keys) | **`design/HUD_FLIGHT_ATTENTION.md`** (goal prompt: `design/HUD_FLIGHT_ATTENTION_GOAL.txt`) |
| Render/performance | `src/render/AGENTS.md` and `design/PERF_BUDGET.md` |
| Feature validation, deterministic lab, Browser/Electron acceptance | `docs/VALIDATION_WORKFLOW.md` → `src/testing/lab/AGENTS.md` when changing the lab |
| Tests/checks/tooling | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` |
| Search/archaeology | `docs/SEARCH_CONTEXT.md` |
| Leftover `sf-*` / agent worktree cleanup, integrate-or-drop triage | **`design/program/WORKTREE_RECOVERY.md`** — exact current ownership only; never delete a ref or clone until its cleanup gate is durable |

Do not sweep `design/`, `.campaign/`, assets, transcripts, or screenshots for an ordinary code task.

## 2. Architecture in one paragraph

A flat `GameState`, event bus, and registry of systems run in a 60 Hz fixed-timestep simulation
decoupled from rendering. Sim code stays independent of Three.js, uses the XZ plane, and uses
`state.rng`/`state.simTime` rather than ambient randomness or wall time. Browser and Electron launch
the same game route. See `ARCHITECTURE.md` for the contract.

## 3. Preserve the shared working tree

The working tree may contain valuable concurrent work that is newer than `HEAD`.

- Inspect `git status --short` and `git diff -- <owner-file>` before diagnosing or editing.
- Treat ownership as **exact and current**. A path is protected when it is dirty/untracked foreign
  work, or when a current-date `NOW.md` row names that exact path and a demonstrably live writer.
  A lane label, mutex name, old branch, worktree, or pre-today claim alone is not a blocker.
- If only part of a packet overlaps protected paths, split or reroute that part and continue the
  disjoint work. Do not turn one exact-path collision into ownership of a subsystem, packet, or plan.
- Never run destructive tree-wide `reset`, `restore`, `checkout`, `clean`, or `stash` operations.
- Preserve unrelated edits. Do not roll back a file merely because its diff is large.
- Add new files to Git intent immediately with `git add -N <file>`.
- Remain on the current branch unless the user explicitly requests branch/worktree management.
- Push only the owned branch by explicit name; never `git push --all`, `--mirror`, or publish
  unrelated refs.
- Commit finished pieces as you go: stage only your owned files, make a focused atomic commit, push
  the current branch by explicit name. Do not wait for blanket authorization or batch unrelated work.

## 4. Authority and current work

When sources disagree: user direction → `ARCHITECTURE.md` (technical) → `design/VISION.md`
(the owner's fantasy and UVP — wins on product emphasis) → `design/GDD_2_0.md` → `design/program/` →
the activated plan/spec → supporting references. `docs/POLICY_MANIFEST.md` says which files may
direct an agent; read it before treating prompts, archives, transcripts, or campaign material as
policy.

Live code, current checks, and player-route evidence determine whether descriptive claims are true.

For a user-authorized multi-plan campaign: record and skip a blocked unit while other safe work
continues; an empty ready queue is not completion; missing local code, manifests, checks, or packet
files are work, not external blockers. Status, receipt, harness, and validation-only work do not
count as production outcomes unless the user asked for those artifacts. Finish only the user's
declared milestone, or when every remaining route has a concrete external dependency or exact
live-path collision.

## 5. Live runtime selection

Default play uses:

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
  `src/systems/input.js` is allowed when the task owns input, but requires focused input/rebind/sim
  validation and coordination with concurrent input work.
- **Wired features:** player-facing work must be reachable on the default route. A local candidate,
  report, or hidden flag is not completion.
- **Assets:** exact manifests, release metadata, and runtime maps outrank prose inventories. Honor a
  currently active lock/authoring signal, but historical lane documents are not permanent ownership.
- **Visual craft:** player-facing graphics start at `docs/visual-assets/README.md` and obey
  `VISUAL_ASSET_PRODUCTION_STANDARD.md`; VFX and world dressing also obey `VFX_TECHNIQUE_STANDARD.md`
  (both under `docs/visual-assets/`). A camera-facing soft square/disc (soft-particle billboard,
  point sprite, radial-gradient glow card) is never a stand-in for a designed object — distant
  background stars are the only exception, and only while tiny, bright, and at sky depth; if the
  player can fly past it, it is not a star. Blender/GLB work must complete the proportional
  fiction/material preflight in `.grok/skills/spaceface-blender-material-truth/SKILL.md`; a DCC
  default is never a material choice. Tier A/B uses component-level records; do not wait for a
  reviewer to name the plastic/clay/primitive failure after authoring. Gates G1/G2/G4 need a
  hash-bound visual review — a technical receipt cannot close them, a component-scoped pass never
  implies a whole-asset pass, and missing review keeps the gate open.
- **Performance:** optimize algorithms, allocation, batching, cadence, culling, residency, and frame
  pacing. Do not pass gates by removing authored visuals or lowering default quality.
- **Accessibility:** preserve input reachability, reduced-motion/flash behavior, legibility, and
  contrast. Accessibility does not require a universal visual style.
- **Dependencies/media:** allowed when they materially improve quality and their bundle/performance,
  determinism/save, and maintenance effects are understood.

## 7. Common-bug routing

Use `docs/COMMON_BUGS.md` before broad grep for recurring failures such as fixes applied to legacy
implementations, hostile spawn behavior, asset fallback, heat ambiguity, or launcher/performance drift.

## 8. System update order

`src/core/registry.js` is the source. Generated `docs/SYSTEM_REGISTRY.md` explains system and render
order; do not copy the list into policy files.

## 9. Verification router

Run the checks you think are necessary for the change you made. Prefer the fast gate first and
escalate only when it justifies the cost; don't loop on verification rituals.

| You want | Run |
|---|---|
| Fast gate, before and after an edit | `npm run check:baseline` (~15s) |
| What the running game is actually doing (freeze, hitch, "why is it slow") | `npm run probe:runtime-witness`, then read `.devshots/runtime-witness/report.md` |
| Broad sweep | `npm run check:all` (not `check` — a fail-fast chain that hides failures) |
| Middle tier | `npm run check:all:smoke` |

- `check:baseline` is the everyday tool. `--list` shows what it covers; `--only=a,b` runs a subset.
- Prefer `check:all` over `check`: `check` is a fail-fast `&&` chain, so a green tail is not coverage
  if it aborted early.
- Don't re-record `test/*.expected.json` goldens just to pass, and don't loop on a failing hash
  without understanding it — `docs/COMMON_BUGS.md` §8 owns the sim/hash procedure; historical
  check-tooling traps live there too.
- Visual, accessibility, and performance claims need current player-facing evidence, but decide
  proportionately in the moment how much. Don't run headed acceptance as a ritual.
- Before freeze or performance work, run the runtime witness. A moving sim clock is not a live 3D
  picture. Do not tune code until that report names the stuck latch or the top frame-time bucket.
- Never rerun the same command against the same candidate after the same failure fingerprint without
  a relevant change — retain the evidence, reduce it to an owner-level regression, or switch to
  another safe production unit. A long build or soak named once is fine; repeated unchanged attempts
  are not progress.

Full validation ladder: [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md).

## 10. Scoped instruction map

Nested `AGENTS.md` files exist only at meaningful ownership/risk boundaries:

`assets/` · `assets/ships/` · `design/` · `design/program/` · `docs/` · `scripts/` · `test/` ·
`tools/` · `src/` · `src/core/` · `src/ai/` · `src/combat/` · `src/data/` · `src/render/` ·
`src/systems/` · `src/testing/lab/` · `src/ui/` · `styles/`

Use the nearest applicable file and follow links for depth. Do not copy its content into another
instruction layer.

## 11. Depth docs (read by need, not by default)

| File | What it holds |
|---|---|
| [`docs/ORIENTATION.md`](./docs/ORIENTATION.md) | The whole repo on one page: game summary, directory map, reading ladder, planner route |
| [`docs/AGENT_OPERATIONS.md`](./docs/AGENT_OPERATIONS.md) | The working agreement in full: finish-the-job rules, concurrent agents, `NOW.md` locks, worktree/junction safety, `check:playable`, reporting |
| [`docs/AGENT_LESSONS.md`](./docs/AGENT_LESSONS.md) | Owner preferences and verified workspace facts — read before behavior changes, bug claims, or graphics/VFX work |
| [`docs/POLICY_MANIFEST.md`](./docs/POLICY_MANIFEST.md) | Which files may direct an agent, document lifetimes, rule-admission test |
