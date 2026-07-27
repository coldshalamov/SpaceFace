<!-- LIFETIME: STABLE -->
# SpaceFace agent orientation

This is the repository engineering front door (invariants + routing). Keep it short: global
invariants and routing belong here; volatile status, subsystem detail, and design technique belong
in the linked owner documents.

After context compaction, route again from this file and live state; do not trust remembered status,
leases, selected packets, or validation results.

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

Use [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md). Run the narrow owner proof first;
use the deterministic lab for eligible gameplay claims; reach Browser/Electron acceptance only
through the packet's broker manifest after lower layers pass. An unchanged expensive failure must
be reduced to a focused regression before another acceptance claim. Visual, accessibility, and
performance acceptance still require current player-facing evidence.

### Which gate to run

| You want | Run | Cost |
|---|---|---|
| The fast gate, before and after any edit | **`npm run check:baseline`** | ~15 s green, ~60 s once `check:massline` is fully green. Hard budget: 90 s. |
| The broad sweep | `npm run check:all` | many minutes |
| A middle tier | `npm run check:all:smoke` | ~7m37s (six minutes of it is `check:flight:clean`) |

**`npm run check:baseline` is the one you will use a hundred times.** Nine links: `check:sim`,
`check:sim:v3`, `check:sim:compare`, `check:sim:v3:compare`, `check:save-schema`, `check:flight:v3`,
`check:m1:tether-mass`, `check:massline`, and `check-ui-screen-imports`. It runs them in a bounded
parallel pool, **runs every link even after one fails**, prints per-link wall time, and exits red if
any link fails *or* if the whole thing blows its 90-second budget. `--list` shows the membership and
why each link is there; `--only=a,b` runs a subset; `--serial` and `--json` exist. It deliberately
excludes `check:flight:clean` (~6 min). Source: `scripts/check-baseline.mjs`.

**When you need the broad sweep, run `npm run check:all`, not `npm run check`.** `check` is a
~100-link `&&` chain, so it reports the FIRST failure and silently skips everything downstream of it
— a single stale assertion can hide twenty gates, including every sim-determinism and flight check.
`check:all` runs the same matrix to completion, continues past failures, and writes
`scratch/check-ci-report/<run>/` with `report.md` (failure-first summary), `report.json`, and a
per-command log. A green `check` tail is not coverage when `check` aborted early — read the report,
not the exit code.

**Two lessons this repo paid for; do not re-learn them.**

1. *An invisible link is worse than a red one.* Until 2026-07-27 `package.json` defined a `precheck`
   npm **lifecycle** script. npm runs lifecycle hooks automatically, so `npm run check` silently ran
   three extra gates first — and when one of them went red, `check` exited 1 having executed **zero**
   of its own links, for 333 commits, while looking like an ordinary check failure. That hook is now
   deleted and its three gates are the first three links of `check` itself, where you can see them.
   If you ever add a `pre*` or `post*` script here, you are re-creating that bug.
2. *A fail-fast aggregate under-reports.* `check:massline` runs 23 children with a fail-fast loop, so
   it names only the first red one. On 2026-07-27 it had three. If an aggregate says one thing is
   broken, that is a lower bound, not a count.

**A green `check:sim:compare` does not mean the golden is current.** `sf-sim compare` returns ok
whenever the two runs agree with *each other*; `scripts/sf-sim.mjs:716` explicitly tolerates
`expectedHash` and `expectedTraceCount` diffs against the expected envelope. It is a determinism
check, not a correctness check. Only `check:sim` / `check:sim:v3` (the `--hash --expect` path) gate
`test/47a.telemetry*.expected.json`.

**When one of those hashes fails, do not re-record it. Run `node scripts/sim-golden-diff.mjs` first**
(add `--flight-system v3` for the V3 envelope). In about thirty seconds it exports a reference commit
with `git archive` — read-only, no checkout, safe while other agents hold the working tree — runs the
sim on both trees, diffs the snapshots, and answers the only question that matters:

- **`IDENTICAL`** — nothing moved.
- **`CONTENT_ONLY`** — zero entity `pos`/`vel`/`rot`/`angVel`/`prevPos` fields changed. The physics and
  flight contract is bit-identical and a re-record is bookkeeping. Write the by-key breakdown and the
  words "zero motion fields changed" into the expected file's `notes` so the next person can trust it.
- **`MOTION_CHANGED`** — something moved differently. If you did not mean to change flight, physics,
  or weapons behaviour, that is a **regression** and re-recording would bury it.

Nine tenths of the churn in that hash is the economy price-cycle table, which is not physics at all,
so "the hash changed" is never by itself a reason to do anything. The verdict is.

## 10. Scoped instruction map

Nested `AGENTS.md` files exist only at meaningful ownership/risk boundaries:

`assets/` · `assets/ships/` · `design/` · `design/program/` · `docs/` · `scripts/` · `test/` ·
`tools/` · `src/` · `src/core/` · `src/ai/` · `src/combat/` · `src/data/` · `src/render/` ·
`src/systems/` · `src/testing/lab/` · `src/ui/` · `styles/`

Use the nearest applicable file and follow links for depth. Do not copy its content into another
instruction layer.
