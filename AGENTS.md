<!-- LIFETIME: STABLE -->
# SpaceFace agent orientation

**Program / "what next" / multi-plan work:** start at root
[`CANONICAL_BUILD_MAP.md`](./CANONICAL_BUILD_MAP.md). It is the single program map and check-off
workflow; it does not replace original plans.

## 1. Start by task

| Task | Start here |
|---|---|
| Program map, "next N", check-off, plan routing | **`CANONICAL_BUILD_MAP.md`** (then `design/program/NOW.md` + queue) |
| What is active or occupied now? | `design/program/NOW.md` → `design/program/README.md` |
| Choose work across several plans / "do the next N" | `CANONICAL_BUILD_MAP.md` → `design/program/roadmap/program-queue.json` |
| Claim a multi-week roadmap packet | `design/program/roadmap/README.md` → `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Implement a feature/fix | Activated plan/spec → `docs/MODULE_MAP.md` → owning nested `AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Event or update-order trace | Generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Ship, station, place, portrait | `assets/AGENTS.md`; ship pipeline at `assets/ships/AGENTS.md`; craft/acceptance at `docs/visual-assets/` |
| Resume dock/hulk/debris place remaster (Blender/EEVEE) | **`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`** (also linked from `CANONICAL_BUILD_MAP.md` §1) |
| Add a map-visible place (planet, station, route, region) | `src/data/PLACE_REGISTRATION.md` — **a new place is not done until `npm run check:atlas-integrity` is green** |
| UI/HUD | `src/ui/AGENTS.md` and `styles/AGENTS.md` |
| Render/performance | `src/render/AGENTS.md` and `design/PERF_BUDGET.md` |
| Feature validation, deterministic lab, Browser/Electron acceptance | `docs/VALIDATION_WORKFLOW.md` → `src/testing/lab/AGENTS.md` when changing the lab |
| Tests/checks/tooling | `test/AGENTS.md`, `scripts/AGENTS.md`, or `tools/AGENTS.md` |
| Search/archaeology | `docs/SEARCH_CONTEXT.md` |

Do not sweep `design/`, `.campaign/`, assets, transcripts, or screenshots for an ordinary code task.

## 2. Architecture in one paragraph

SpaceFace is a Three.js browser/Electron space game. A flat `GameState`, event bus, and registry of
systems run in a 60 Hz fixed-timestep simulation decoupled from rendering. Sim code stays independent
of Three.js, uses the XZ plane, and uses `state.rng`/`state.simTime` rather than ambient randomness or
wall time. Browser and Electron launch the same game route. See `ARCHITECTURE.md` for the contract.

## 3. Preserve the shared working tree

The working tree may contain valuable concurrent work that is newer than `HEAD`.

- Inspect `git status --short` and `git diff -- <owner-file>` before diagnosing or editing.
- Never run destructive tree-wide `reset`, `restore`, `checkout`, `clean`, or `stash` operations.
- Preserve unrelated edits. Do not roll back a file merely because its diff is large.
- Add new files to Git intent immediately with `git add -N <file>`.
- Remain on the current branch unless the user explicitly requests branch/worktree management.
- Push only the owned branch by explicit name; never use `git push --all`, `--mirror`, or publish
  unrelated refs.
- Commit finished pieces as you go: when a logical slice is complete, reviewed, and
  verified, stage only its owned files and make a focused atomic commit, then push the
  current branch by explicit name. Do not wait for blanket user authorization; do not
  batch unrelated work or unrelated files into the commit.

## 4. Authority and current work

When sources disagree: user direction → `ARCHITECTURE.md` → `design/GDD_2_0.md` →
`design/program/` → the activated plan/spec → supporting references.

Live code, current checks, and player-route evidence determine whether descriptive claims are true.
Read `docs/POLICY_MANIFEST.md` before treating prompts, archives, transcripts, tool memories, or
campaign material as policy.

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
- **Performance:** optimize algorithms, allocation, batching, cadence, culling, residency, and frame
  pacing. Do not pass gates by removing authored visuals or lowering default quality.
- **Accessibility:** preserve input reachability, reduced-motion/flash behavior, legibility, and
  contrast. Accessibility does not require a universal visual style.
- **Dependencies/media:** allowed when they materially improve quality and their bundle/performance, determinism/save, and maintenance effects are understood.

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
| Broad sweep | `npm run check:all` (not `check` — that's a fail-fast chain that hides failures) |
| Middle tier | `npm run check:all:smoke` |

- `check:baseline` is the everyday tool. `--list` shows what it covers; `--only=a,b` runs a subset.
- Prefer `check:all` over `check`: `check` is a fail-fast `&&` chain, so a green tail is not coverage
  if it aborted early.
- Don't re-record `test/*.expected.json` goldens just to pass — and don't loop on a failing hash
  without understanding it. See [`docs/COMMON_BUGS.md`](./docs/COMMON_BUGS.md) §8 for the sim/hash
  procedure (`scripts/sim-golden-diff.mjs` answers whether a hash change is motion or bookkeeping).
- Historical check-tooling traps (deleted lifecycle hooks, fail-fast under-reporting, golden churn)
  are recorded in [`docs/COMMON_BUGS.md`](./docs/COMMON_BUGS.md), not here — look them up when
  relevant rather than carrying them every turn.
- Visual, accessibility, and performance claims need current player-facing evidence, but decide
  proportionately in the moment how much. Don't run headed acceptance as a ritual.

For the full validation ladder and broker-managed route evidence, see
[`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md).

## 10. Scoped instruction map

Nested `AGENTS.md` files exist only at meaningful ownership/risk boundaries:

`assets/` · `assets/ships/` · `design/` · `design/program/` · `docs/` · `scripts/` · `test/` ·
`tools/` · `src/` · `src/core/` · `src/ai/` · `src/combat/` · `src/data/` · `src/render/` ·
`src/systems/` · `src/testing/lab/` · `src/ui/` · `styles/`

Use the nearest applicable file and follow links for depth. Do not copy its content into another
instruction layer.
