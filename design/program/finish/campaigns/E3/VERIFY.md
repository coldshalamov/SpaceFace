# Campaign E3 — Verification Report

**Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD
**Status:** VERIFIED for mode-scoped dispatch; LOD sub-claim retracted
**Date:** 2026-11-06

---

## 1. What landed

### A. Declarative scheduling modes (`src/runtime/authoritativeSystemManifest.js`)

- `SIM_MODE` keeps `FLIGHT`, `SWARM`, `UNSCOPED`, and the frozen-world labels `DOCKED` / `YARD`.
- `ALL_SIM_MODES` contains only `FLIGHT` and `SWARM`. DOCKED/YARD are not scheduling scopes: the
  ordinary route freezes the full tick while docked or in the yard, so no mode queue runs for them.
- Every one of the 220 `PRODUCTION_UPDATE_ORDER` ids keeps an explicit declaration. The live split:

  | Group | Count |
  |---|---:|
  | Always run (Flight + Swarm) | 19 |
  | Flight + Swarm combat | 38 |
  | Flight adventure | 49 |
  | Flight open-world only | 104 |
  | Swarm only | 10 |

  Queue sizes are **210 Flight / 67 Swarm**. The previous report's 28/48/115 buckets were stale;
  the Line fix (`6dd2ceedceb2`) and the capital-boss scope fix in this pass moved nine systems into
  the combat bucket. `capitalBossEncounters` now runs in Swarm because `swarmMode` hands the Iron
  Maw fight to it and `survivalWave` reads the fight record there.
- Exported validation and query helpers: `validateSystemModeDeclarations`,
  `getDeclaredSystemModeScope`, `getSystemModeScope`, `systemRunsInMode`.

### B. Mode-partitioned host scheduling (`src/core/catchupPolicy.js`)

- `resolveActiveSimMode(state)` still resolves the state label (including DOCKED/YARD) so skip
  decisions can name why a tick is frozen.
- `partitionUpdateSystems` pre-builds only the two dispatchable queues, preserving exact relative
  order from the manifest (zero filtering in `step()`).
- `updateQueueForThisStep` selects the queue and reports `state.simModeRuntime`; `getStepExecutionStats`
  derives the same numbers without writing state.
- **Explicit unknown-mode policy:** an unrecognised mode or a frozen DOCKED/YARD label has no
  partition, so the queue is empty and `shouldSkipSystemThisStep` skips every system. Both sides
  now agree (review F7).
- **Clock discontinuity reset:** the partition owns a per-state clock record carrying the resolved
  mode. When the mode changes, its calendar stamps and baseline are cleared and marked unseeded, so
  the first resumed calendar call returns the fixed dt. `updateDt` repeats the check as a safety net
  for direct callers. This removes the post-Crucible burst that previously delivered a five-minute
  dt to economy/automation/salvage/routeFollower (review F2).

### C. Profiler preamble (`src/core/simStepProfiler.js`, `src/core/sim.js`, `src/core/authoritativeSimStep.js`)

- The worker stepper now begins the measured tick before `core.preStep` and records
  `core.preStep`, `input`, and `core.publishInputCommand`; the Node sim host records
  `core.preStep`. Execution order is unchanged.
- `core.*` rows are treated as top-level work despite their dotted namespace, so the ranking
  denominator no longer drops `core.lifetimeSweep`/`core.preStep` (review F6/F7).
- The per-tick `order` array is reused; heap sampling happens before the retained scratch is
  touched. Allocation is documented as Node/harness evidence; a worker realm without
  `performance.memory` reports `allocation: null`.
- The **main-lane `registry.js` is still not wired to this profiler**; it keeps its existing
  `perfRuntime` system timings. The E2 record now states that instead of claiming main-lane
  coverage.

### D. LOD retracted

`state.simLOD` and `getSimulationLODTelemetry` were removed. The field had no `src/` reader, no
rate dimension, and was not an optimisation. Activity tier telemetry remains on
`state.activityRuntime`, whose counts and physics/glass/runway sets have real consumers.

## 2. Test evidence

### Focused suites

- `test/finish-e3-mode-scoped-sim-and-lod.test.mjs`: **11/11**.
  - declaration coverage and scheduling-mode set;
  - `systemRunsInMode` Flight/Swarm/UNSCOPED plus frozen-label rejection;
  - `resolveActiveSimMode` for flight, swarm, docked, yard;
  - pre-built queue membership/order;
  - telemetry write and pure `getStepExecutionStats`;
  - activityRuntime publishing and absence of `state.simLOD`;
  - dynamic mode switching;
  - one policy for frozen/unknown modes;
  - the Line's combat-flight membership in Swarm;
  - the five-minute Swarm→Flight clock-discontinuity regression.
- `test/sim-step-profiler.test.mjs`: **5/5** (ranking, disabled cost, sampling, core top-level rows,
  per-tick row reset).

### Core set

`node --test test/finish-e3-mode-scoped-sim-and-lod.test.mjs test/sim-step-profiler.test.mjs
test/authoritative-manifest.test.mjs test/sim-clock-catchup.test.mjs test/calendar-elapsed-time.test.mjs
test/activity-classification.test.mjs test/activity-runtime.test.mjs test/rc-456-swarm-runs-clean.test.mjs
test/fb-system-clock-declared.test.mjs test/w2d-manifest-update-coverage.test.mjs
test/capital-boss-frozen-clock.test.mjs`

→ **119 passed / 0 failed**.

Individual counts: authoritative-manifest 16, sim-clock-catchup 11, calendar-elapsed-time 8,
activity-classification 12, activity-runtime 32, capital-boss-frozen-clock 8.

### Related checks

- `node scripts/check-sg02-authority.mjs` — OK.
- `node scripts/check-sg02-dynamic-body-owner.mjs` — OK.
- `node scripts/check-sg06-production-ports.mjs` — OK.
- `node scripts/check-depth-program-k1-behavior.mjs` — OK.
- `node --test test/io-love-letter-buoy-service.test.mjs` — 25/25.

## 3. Determinism

`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json
--expect test/47a.telemetry.save-v23.expected.json --hash --repeat 5 --reload-at 600`

→ `134e1e7f8296ed4c462d620421d8ec7102886ec629a39c9a0cd778a1f260aad5`, byte-identical to
`test/47a.telemetry.save-v23.expected.json` (`deterministic: true`, exit 0).

## 4. Non-claims

- No docked or yard mode queue is dispatched; the freeze owns those states. The scope declarations
  for those states were removed rather than left as an unreachable claim.
- No simulation-LOD rate change is shipped.
- No live Swarm worker profile is claimed; only queue membership and the existing Swarm regression
  are proven.
