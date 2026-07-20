# SpaceFace agent orientation

This is the repository front door. Keep it short: global invariants and routing belong here; volatile
status, subsystem detail, and design technique belong in the linked owner documents.

## 1. Start by task

| Task | Start here |
|---|---|
| What is active or occupied now? | `design/program/NOW.md` → `design/program/README.md` |
| Choose work across several plans / "do the next N" | `design/program/PROGRAM_MAP.md` → `design/program/roadmap/program-queue.json` |
| Claim a multi-week roadmap packet | `design/program/roadmap/README.md` → `design/program/roadmap/00_EXECUTION_PROTOCOL.md` |
| Implement a feature/fix | Activated plan/spec → `docs/MODULE_MAP.md` → owning nested `AGENTS.md` |
| Recurring bug | `docs/COMMON_BUGS.md` |
| Event or update-order trace | Generated `docs/EVENT_ROUTING.md` / `docs/SYSTEM_REGISTRY.md` |
| Product or system design | `design/GDD_2_0.md` → relevant spec2/spec3 slice |
| Ship, station, place, portrait | `assets/AGENTS.md`; ship pipeline continues at `assets/ships/AGENTS.md` |
| Add a map-visible place (planet, station, route, region) | `src/data/PLACE_REGISTRATION.md` — **a new place is not done until `npm run check:atlas-integrity` is green** |
| UI/HUD | `src/ui/AGENTS.md` and `styles/AGENTS.md` |
| Render/performance | `src/render/AGENTS.md` and `design/PERF_BUDGET.md` |
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
- Commit only a reviewed logical slice when the user has authorized commits.

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
- **HUD:** keep the flight HUD non-diegetic; no cockpit/visor/helmet framing. Preserve useful roster,
  radar, objective, station, navigation, and tactical information unless a tested replacement is
  demonstrably clearer.
- **Dependencies/media:** allowed when they materially improve quality and their license,
  bundle/performance, determinism/save, and maintenance effects are understood.

### Rules that do not belong here

Do not add global palette lists, blur/opacity recipes, triangle or texture ceilings, effect counts,
iteration/deficiency quotas, mandatory techniques, self-score thresholds, fixed file ownership for
inactive lanes, or report-only completion rituals. Checks should prove behavior, contracts,
accessibility, determinism, reachability, or measured performance—not freeze an aesthetic recipe.

## 7. Common-bug routing

Use `docs/COMMON_BUGS.md` before broad grep for recurring failures such as fixes applied to legacy
implementations, hostile spawn behavior, asset fallback, heat ambiguity, or launcher/performance drift.

## 8. System update order

`src/core/registry.js` is the source. Generated `docs/SYSTEM_REGISTRY.md` explains system and render
order; do not copy the list into policy files.

## 9. Verification router

Run the narrow owning check first, then broaden in proportion to risk.

| Changed seam | Minimum relevant proof |
|---|---|
| Sim/determinism | `npm run check:sim:compare` plus focused subsystem test |
| Flight/render loop | `npm run check:flight:clean`, `npm run check:assets:live`, measured perf probe |
| Asset/manifests/render wiring | asset reachability, live-load/status, visual stability, player-route capture |
| UI/a11y | focused UI check, a11y/contrast, UI perf, representative screenshot |
| Launcher/server | `npm run check:launch-policy` |
| Broad shared integration | `npm run check` after focused checks pass |

Visual acceptance requires current player-facing evidence. Green source-pattern checks alone do not
prove visual quality or usability.

## 10. Scoped instruction map

Nested `AGENTS.md` files exist only at meaningful ownership/risk boundaries:

`assets/` · `assets/ships/` · `design/` · `design/program/` · `docs/` · `scripts/` · `test/` ·
`tools/` · `src/` · `src/core/` · `src/ai/` · `src/combat/` · `src/data/` · `src/render/` ·
`src/systems/` · `src/ui/` · `styles/`

Use the nearest applicable file and follow links for depth. Do not copy its content into another
instruction layer.
