# Campaign E3 — Verification Report

**Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD
**Status:** VERIFIED for mode-scoped dispatch; LOD sub-claim retracted
**Date:** 2026-11-06 (second review pass)

---

## 1. What landed

### A. Declarative scheduling modes (`src/runtime/authoritativeSystemManifest.js`)

- `SIM_MODE` keeps `FLIGHT`, `SWARM`, `UNSCOPED`, the frozen label `DOCKED`, the live `YARD` and
  the fail-closed `UNKNOWN`.
- `ALL_SIM_MODES` is `[FLIGHT, SWARM, YARD]`. DOCKED is the only frozen scheduling label: the
  ordinary route freezes the tick through `presentationFreeze`, so no queue runs for it. YARD is a
  live working state (the player is towing in the yard), so it deliberately gets the
  flight-equivalent queue.
- Every one of the 220 `PRODUCTION_UPDATE_ORDER` ids keeps an explicit declaration. The live split:

  | Group | Count |
  |---|---:|
  | Always run (Flight + Swarm + Yard) | 19 |
  | Flight + Swarm + Yard combat | 38 |
  | Flight + Yard adventure | 49 |
  | Flight + Yard open-world only | 104 |
  | Swarm only | 10 |

  Queue sizes are **210 Flight / 67 Swarm / 210 Yard**. The previous report's 28/48/115 buckets
  were stale; the Line fix (`6dd2ceedceb2`) moved nine systems into the combat bucket.
  `capitalBossEncounters` runs in Swarm because `swarmMode` hands the Iron Maw fight to it and
  `survivalWave` reads the fight record there. `lineProgression` is adventure: Flight + Yard, not
  Swarm.
- Exported validation and query helpers: `validateSystemModeDeclarations`,
  `getDeclaredSystemModeScope`, `getSystemModeScope`, `systemRunsInMode`.

### B. Mode-partitioned host scheduling (`src/core/catchupPolicy.js`)

- `resolveActiveSimMode(state)` resolves the state label (Flight, Swarm, Docked, Yard) and returns
  `UNKNOWN` for an unrecognised explicit `state.mode`. An unknown label has no partition, so the
  queue is empty and the per-system skip is true for every id. `mode: 'banana'` is the regression.
- `partitionUpdateSystems` pre-builds only the dispatchable queues, preserving exact relative
  order from the manifest (zero filtering in `step()`). It also collects per-fixed-tick drain
  owners (`drainTick`) for the economy slice; every host calls `drainStep` after `core.preStep`.
- `updateQueueForThisStep` selects the queue; `getStepExecutionStats` derives the same numbers
  without writing state. The old write-only `state.simModeRuntime` receipt was removed (review F7).
- **Explicit unknown-mode policy:** an unrecognised mode or the frozen DOCKED label has no
  partition, so the queue is empty and `shouldSkipSystemThisStep` skips every system. Both sides
  agree (review F7).
- **Clock discontinuity reset, narrowed:** a mode change drops stamps only for owners absent from
  the new mode. A dual-mode calendar owner (barkDirector/buildIdentity/wingMorale/
  masslineImpactDamage/save) keeps its real interval; a returning owner is reseeded and gets the
  fixed dt, never a run-sized burst (review F2).

### C. Profiler preamble and basis labels (`src/core/simStepProfiler.js`, `src/core/sim.js`, `src/core/authoritativeSimStep.js`)

- The worker stepper begins the measured tick before `core.preStep` and records
  `core.preStep`, `input`, `core.publishInputCommand` and `core.tickDrains`; the Node sim host
  records `core.preStep`/`core.tickDrains`. Execution order is unchanged.
- Per-system `meanMs`/p50/p95/p99/max are labelled `basis: 'per-call'`; `meanMsPerTick` amortises
  a calendar owner over measured ticks. The step row is `basis: 'per-tick'`. This stops a 2 Hz
  calendar row being compared with a 60 Hz table row without saying which basis it is.
- The **main-lane `registry.js` is still not wired to this profiler**; it keeps its existing
  `perfRuntime` system timings.

### D. Live YARD scope

- A `shipbreakingYard.activeJobId` resolves to YARD, and YARD includes `input`, `actions`,
  `physics`, `save`, `tetherGameplay`, `shipbreakingYard`, adventure owners and combat-flight
  owners. SWARM-only arena systems stay out. The live tow route
  (`test/pro-experiences-shipbreakingYard.test.mjs`, 29/29) is the proof: the old empty queue made
  the first tow a no-op.

### E. LOD retracted

`state.simLOD` and `getSimulationLODTelemetry` were removed. The field had no `src/` reader, no
rate dimension, and was not an optimisation. Activity tier telemetry remains on
`state.activityRuntime`, whose counts and physics/glass/runway sets have real consumers.

### F. Economy slice drain (E2, shared with this campaign)

The economy is a 2 Hz calendar owner. A many-advance pass could outlive its 5 s due period, and the
next due tick replaced it. The slice now advances once per fixed tick (`drainStep`), 3 advances per
phase (9 maximum), carries a due tick that lands mid-pass, emits the receipt on the period
boundary, counts completed passes only, and snapshots the cursor on save. Proof:
`test/economy-slice-cadence.test.mjs` (2100 ticks and 60 s) plus the flag-on 47-A run.

## 2. Test evidence

### Focused suites

- `test/finish-e3-mode-scoped-sim-and-lod.test.mjs`: **12/12**.
  - declaration coverage and scheduling-mode set;
  - `systemRunsInMode` Flight/Swarm/Yard/UNSCOPED plus DOCKED/UNKNOWN rejection;
  - `resolveActiveSimMode` for flight, swarm, docked, yard and `banana`;
  - pre-built queue membership/order, including the Yard queue and `lineProgression` /
    `capitalBossEncounters`;
  - telemetry write and pure `getStepExecutionStats`;
  - activityRuntime publishing and absence of `state.simLOD`;
  - dynamic mode switching;
  - one policy for frozen/unknown modes, with the empty `mode:'banana'` queue and every system
    skipped;
  - the Line's combat-flight membership in Swarm;
  - the five-minute Swarm→Flight clock-discontinuity regression;
  - the dual-mode calendar interval regression.
- `test/sim-step-profiler.test.mjs`: **5/5** (ranking, disabled cost, sampling, core top-level rows,
  per-tick row reset).
- `test/economy-slice-cadence.test.mjs`: **4/4** (2100-tick cadence, 60 s = 12 receipts, no-clobber,
  serialize no-mutate, cursor resume).

### Core set

`node --test test/finish-e3-mode-scoped-sim-and-lod.test.mjs test/sim-step-profiler.test.mjs
test/authoritative-manifest.test.mjs test/sim-clock-catchup.test.mjs test/calendar-elapsed-time.test.mjs
test/activity-classification.test.mjs test/activity-runtime.test.mjs test/rc-456-swarm-runs-clean.test.mjs
test/fb-system-clock-declared.test.mjs test/w2d-manifest-update-coverage.test.mjs
test/capital-boss-frozen-clock.test.mjs`

→ **120 passed / 0 failed**.

The E3 batch also names the live yard route:
`node --test test/pro-experiences-shipbreakingYard.test.mjs` → **29/29**.

Individual counts: authoritative-manifest 16, sim-clock-catchup 11, calendar-elapsed-time 8,
activity-classification 12, activity-runtime 32, capital-boss-frozen-clock 8.

### Related checks

- `node scripts/check-sg02-authority.mjs` — OK.
- `node scripts/check-sg02-dynamic-body-owner.mjs` — OK.
- `node scripts/check-sg06-production-ports.mjs` — OK.
- `node scripts/check-depth-program-k1-behavior.mjs` — OK.
- `node --test test/io-love-letter-buoy-service.test.mjs` — 25/25.

## 3. Determinism

The active reference remains **v24**:
`1fedbd09dc3d8b70c4c392f6258b44f41a3969295e2df550b5eeeaa723084331` legacy and the v3
native-contact twin. The current shared checkout is red for a foreign reason
(`src/data/newGameDefaults.js` starter shield and `src/systems/input.js` gamepad travel-latch are
uncommitted), and no golden was re-recorded to hide it. v25 `080c5bd9…` is the obsolete un-drained
slicing shape and is kept as history only; v24/v25 envelopes were not overwritten.

The economy drain fix is proven behind its flag by `test/economy-slice-cadence.test.mjs`:
2100 production ticks emit 7 receipts (35 s), 60 s emits 12, drift/slice sub-phases run, no due
tick is entered while a pass is in flight, and a saved cursor resumes without replay or loss. The
flag-on 47-A run is deterministic and reload-equal (`fb76e5b9…` legacy / `f06c59d5…` v3), but it
is not promoted to a reference until a clean tree confirms the delta. Re-enable `economySlicing`
only with that clean v26 append-only record and a fresh profile.

## 4. Non-claims

- No docked mode queue is dispatched; the freeze owns that state.
- No simulation-LOD rate change is shipped.
- No live Swarm worker profile is claimed; only queue membership and the existing Swarm regression
  are proven.
- The profiler does not cover the main-lane `registry.js` implementation; its numbers come from
  `perfRuntime`.
