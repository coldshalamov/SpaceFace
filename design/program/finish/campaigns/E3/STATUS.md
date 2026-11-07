# E3 — Mode-Scoped Simulation + Simulation LOD: Status

- **Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD
- **Lane:** Lane 2 — SIM CORE
- **Phase:** COMPLETE
- **Updated:** 2026-11-06

## Checklist

- [x] Read master plan, lane collision map, performance handoff (2026-11-06 root-cause map), feel contract, and architecture docs
- [x] Audit `authoritativeSystemManifest.js`, `catchupPolicy.js`, `authoritativeSimStep.js`, `sim.js`, `registry.js`, `activityClassification.js`, `activityRuntime.js`, `activityScheduler.js`
- [x] Write `design/program/finish/campaigns/E3/DIAGNOSIS.md`
- [x] Claim E3 write paths in `design/program/NOW.md`
- [x] Implement declarative mode manifest (`SIM_MODE`, `ALL_SIM_MODES`, `SYSTEM_MODE_DECLARATIONS`, `getDeclaredSystemModeScope`, `getSystemModeScope`, `systemRunsInMode`, `validateSystemModeDeclarations`) in `src/runtime/authoritativeSystemManifest.js`
- [x] Implement pre-built per-mode tick queues (`resolveActiveSimMode`, `modePartitions`, `updateQueueForThisStep`, `getStepExecutionStats`, deterministic `state.simModeRuntime`) in `src/core/catchupPolicy.js`
- [x] Implement simulation LOD telemetry (`getSimulationLODTelemetry`, `state.simLOD`) across distance bands (`near`, `mid`, `far`), `SIM_TIER` tiers, and shelved far-actor records in `src/world/activityRuntime.js`
- [x] Add focused verification suite `test/finish-e3-mode-scoped-sim-and-lod.test.mjs` and run full regression suite (`test/authoritative-manifest.test.mjs`, `test/sim-clock-catchup.test.mjs`, `test/activity-classification.test.mjs`, etc.)
- [x] Write `design/program/finish/campaigns/E3/VERIFY.md`
- [x] Release claim in `design/program/NOW.md`
