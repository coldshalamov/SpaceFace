# E3 — Mode-Scoped Simulation + Simulation LOD: Status

- **Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD
- **Lane:** Lane 2 — SIM CORE
- **Phase:** COMPLETE (second review fixes applied)
- **Updated:** 2026-11-06

## What actually ships

- Declarative mode manifest: `SIM_MODE`, `ALL_SIM_MODES`, `SYSTEM_MODE_DECLARATIONS`,
  `getDeclaredSystemModeScope`, `getSystemModeScope`, `systemRunsInMode`,
  `validateSystemModeDeclarations` in `src/runtime/authoritativeSystemManifest.js`.
- **FLIGHT, SWARM and YARD are scheduling scopes.** `DOCKED` still resolves as a state label so a
  skip decision can name it, but `presentationFreeze` owns that frozen tick and no queue is
  dispatched. A live `shipbreakingYard.activeJobId` is a working state, not a freeze: YARD gets the
  flight-equivalent queue (everything except SWARM-only systems), so the tow route keeps input,
  physics, tether, save and `shipbreakingYard` running. The old YARD-as-frozen-label policy made
  the whole tick an empty queue and broke `test/pro-experiences-shipbreakingYard.test.mjs`.
- **Unknown is fail-closed.** `resolveActiveSimMode({ mode: 'banana' })` returns
  `SIM_MODE.UNKNOWN`, which has no partition; `selectStepQueue` returns `[]` and
  `shouldSkipSystemThisStep` is true for every one of the 220 production ids. Menu/pause/loading
  keep their historical unscoped behaviour; `docked` is the only frozen scheduling label.
- Pre-built per-mode tick queues in `partitionUpdateSystems`; `updateQueueForThisStep` selects one
  with no per-step filtering. Real split of the 220 update ids:

  | Scope | Count |
  |---|---:|
  | Always (Flight + Swarm + Yard) | 19 |
  | Flight + Swarm + Yard combat | 38 |
  | Flight + Yard adventure | 49 |
  | Flight + Yard open-world only | 104 |
  | Swarm only | 10 |

  Queue sizes: **Flight 210, Swarm 67, Yard 210**. The review's 10/29/49/113/19 split predates
  `6dd2ceedceb2`, which moved the Line family and `lineHeads` into the combat scope; this pass
  also keeps `capitalBossEncounters` in Swarm (the wave director and `survivalWave` read its
  fights) and `lineProgression` in adventure (Flight + Yard, not Swarm).
- **One unknown-mode policy:** a mode with no pre-built partition dispatches an empty queue, and
  `shouldSkipSystemThisStep` / `shouldSkipSystemOnCatchup` skip every system for the same mode.
  The queue and the per-system skip can no longer disagree (E3 review F7).
- **A mode change is a clock discontinuity only for owners that leave.** `updateQueueForThisStep`
  records the resolved mode per state and drops stamps only for owners absent from the new mode;
  owners present in both (buildIdentity, barkDirector, wingMorale, masslineImpactDamage, save)
  keep the legitimate one-interval delta. Returning owners are marked for a fixed-dt reseed and
  cannot burst-catch-up the skipped run (E3 review F2; regression in the focused suite).
- `getStepExecutionStats` is the pure derivation and `updateQueueForThisStep` selects the queue;
  neither writes `state.simModeRuntime` (the old write-only receipt is gone, E3 review F7).

## LOD — retracted, not claimed

`state.simLOD` was write-only: no `src/` reader, no `rate`/`hz`/`sliced` dimension, and no
optimisation attached to it. It has been removed along with `getSimulationLODTelemetry`. Activity
tier counters already publish through `state.activityRuntime` (`counts.s0..s4`, physics/glass/
runway sets) and have real readers; that is the honest telemetry surface. No simulation-LOD rate
change is claimed by this campaign.

## Swarm profile — honest state

No matched live Swarm worker capture was taken in this pass. Queue membership (67 of 220 systems)
and `test/rc-456-swarm-runs-clean.test.mjs` prove the arena shape, but the claim "the profiler shows
a Swarm round touching only the Swarm manifest" is **not** backed by a live profile export and is
not made here. A Crucible worker profile is the next evidence step if that claim is needed.

## Verification

- Focused suite `test/finish-e3-mode-scoped-sim-and-lod.test.mjs`: **12/12**.
- `test/sim-step-profiler.test.mjs`: **5/5**.
- Core clock/manifest/activity set (see `VERIFY.md`): **120/120** across 11 files.
- Live yard route `test/pro-experiences-shipbreakingYard.test.mjs`: **29/29** (the tow-to-delivery
  test is the regression for the YARD scope).
- 47-A: the active reference remains **v24** (`1fedbd09…`, v3 native-contact `015c4c…`). The
  shared checkout is currently red for a foreign reason (starter shield + gamepad travel-latch
  edits); no golden was re-recorded. The economy drain fix is verified behind
  `economySlicing` (cadence suite) and is held off until a clean-tree v26 can be recorded. v25
  `080c5bd9…` is the obsolete un-drained shape. See `VERIFY.md` §3.

## Write claim

Released. Paths this campaign owns are the manifest, `catchupPolicy.js`, the two step hosts,
`simCoreFlags.js`, `activityRuntime.js`, the focused E3 test, and these campaign records.
