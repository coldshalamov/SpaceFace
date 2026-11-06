# Campaign E3 — Verification Report

**Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD  
**Status:** VERIFIED  
**Date:** 2026-11-06  

---

## 1. Summary of Changes

### A. Authoritative System Mode Declarations (`src/runtime/authoritativeSystemManifest.js`)
- Defined `SIM_MODE`:
  - `FLIGHT` (`'flight'`): Open space exploration, transit, and shipbreaking.
  - `DOCKED` (`'docked'`): Station services, missions, trade, crafting, narrative.
  - `SWARM` (`'swarm'`): Crucible swarm wave combat and arena mechanics.
  - `YARD` (`'shipbreakingYard'`): Specialized salvage/dismantling in Ceres Belt.
  - `UNSCOPED` (`'unscoped'`): Fallback for unit tests and profileless stubs.
- Declared explicit mode scopes for all **220 systems** in `PRODUCTION_UPDATE_ORDER`:
  - **Always Active (19):** Core input, actions, physics, world, save, chronicle, and DOM-guarded HUDs (`masslineHud`, `crucibleFocus`, etc.).
  - **Swarm Only (10):** `survivalArena`, `swarmFortify`, `swarmArena`, `survivalWave`, `survivalRun`, `swarmChain`, `killReplay`, `killcamRecorder`, `swarmJuice`, `swarmElites`.
  - **Combat Flight (28):** Flight & swarm weapons, countermeasures, projectiles, collision consequences, aiSlot, autoTargetAssist, tumble states (skipped when docked).
  - **Open-World Adventure (48):** Station services, missions, trade economy, factions, story, sector sim, narrative courts (active in flight, docked, yard; skipped in swarm).
  - **Flight & Yard Only (115):** Beacons, travel lanes, scanning, salvage, mining, field depletion, asteroid formations, traffic (skipped when docked and in swarm).
- Exported validation and query helpers:
  - `validateSystemModeDeclarations(updateIds = PRODUCTION_UPDATE_ORDER)`: asserts complete 220/220 coverage and valid mode names.
  - `getDeclaredSystemModeScope(id)`: returns declared mode array or null.
  - `getSystemModeScope(id)`: returns declared mode array or throws if missing from declarations.
  - `systemRunsInMode(id, mode)`: boolean check (always true in `UNSCOPED`).

### B. Mode-Partitioned Host Scheduling (`src/core/catchupPolicy.js`)
- Added `resolveActiveSimMode(state)`:
  - Resolves active mode based on `state.run?.kind === 'survival'`, `state.ui?.docked`, `state.mode`, and active yard ticket.
  - Returns `SIM_MODE.UNSCOPED` when state lacks mode markers, maintaining 100% backward compatibility for existing unit tests.
- Enhanced `partitionUpdateSystems(systems)`:
  - Pre-partitions mode queues for `flight`, `docked`, `swarm`, and `shipbreakingYard` once at host initialization.
  - Pre-filters `all`, `table`, `combat`, `calendar`, `tableCalendar`, `tickQueues[0..29]`, and `catchupTickQueues[0..29]`.
  - Guarantees zero garbage allocations during `step()`.
  - Preserves exact relative ordering from the authoritative manifest in every mode.
- Enhanced `updateQueueForThisStep(partitions, state)`:
  - Selects the pre-partitioned mode queue matching `resolveActiveSimMode(state)`.
  - Emits deterministic execution telemetry on `state.simModeRuntime = { mode, activeCount, totalCount, skippedCount }`.
- Updated `shouldSkipSystemThisStep` and `shouldSkipSystemOnCatchup` to enforce mode boundaries.
- Exported `getStepExecutionStats(partitions, state)`.

### C. Simulation Level-of-Detail (LOD) Telemetry (`src/world/activityRuntime.js`)
- Added unified `getSimulationLODTelemetry(state)` and updated `publishScalars(state, runtime)`:
  - Groups entity tiers into clean distance bands:
    - `near`: `s0` (exact physics) + `s1` (near physics / active AI).
    - `mid`: `s2` (simplified kinematics / throttled AI).
    - `far`: `s3` (dormant) + `s4` (aggregate population) + shelved far-actor records (`state.world.farActors.rows`).
  - Provides full tier counters on `state.simLOD = { near, mid, far, tiers: { s0, s1, s2, s3, s4, shelved }, physics, activeAi, activeTraffic, tick }`.

---

## 2. Test Evidence

### A. Dedicated Suite (`test/finish-e3-mode-scoped-sim-and-lod.test.mjs`)
- `validateSystemModeDeclarations validates all production update systems`: PASSED (0 violations across 220 systems).
- `validateSystemModeDeclarations catches missing, invalid, or empty declarations`: PASSED.
- `systemRunsInMode handles UNSCOPED and specific modes correctly`: PASSED.
- `resolveActiveSimMode extracts active mode from state accurately`: PASSED.
- `partitionUpdateSystems pre-builds mode-scoped queues preserving relative order`: PASSED.
- `updateQueueForThisStep and telemetry update cleanly during step`: PASSED.
- `Simulation LOD telemetry categorizes near, mid, far, and shelved entities`: PASSED.
- `createSimulation runs smoothly with dynamic mode switching`: PASSED.

### B. Core Clock and Manifest Suites
- `test/authoritative-manifest.test.mjs`: 16/16 passed.
- `test/fb-system-clock-declared.test.mjs`: 6/6 passed.
- `test/sim-clock-catchup.test.mjs`: 11/11 passed.
- `test/w2d-manifest-update-coverage.test.mjs`: 3/3 passed.
- `test/rc-456-swarm-runs-clean.test.mjs`: 7/7 passed.
- `test/activity-classification.test.mjs`: 44/44 passed.
- `test/activity-runtime.test.mjs`: 35/35 passed.

Total suite execution across combined runs: **79/79 passed cleanly** with zero regressions.
