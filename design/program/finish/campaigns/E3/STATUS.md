# E3 — Mode-Scoped Simulation + Simulation LOD: Status

- **Campaign:** E3 — Mode-Scoped Simulation + Simulation LOD
- **Lane:** Lane 2 — SIM CORE
- **Phase:** COMPLETE (review fixes applied)
- **Updated:** 2026-11-06

## What actually ships

- Declarative mode manifest: `SIM_MODE`, `ALL_SIM_MODES`, `SYSTEM_MODE_DECLARATIONS`,
  `getDeclaredSystemModeScope`, `getSystemModeScope`, `systemRunsInMode`,
  `validateSystemModeDeclarations` in `src/runtime/authoritativeSystemManifest.js`.
- **Only Flight and Swarm are scheduling scopes.** `DOCKED` and `YARD` still resolve as state
  labels so a skip decision can name them, but they are deliberately absent from
  `ALL_SIM_MODES`: `presentationFreeze` skips the full tick while either holds, so no queue is
  ever dispatched for them. There is no docked or yard scoping claim.
- Pre-built per-mode tick queues in `partitionUpdateSystems`; `updateQueueForThisStep` selects one
  with no per-step filtering. Real split of the 220 update ids:

  | Scope | Count |
  |---|---:|
  | Always (Flight + Swarm) | 19 |
  | Flight + Swarm combat | 38 |
  | Flight (adventure) | 49 |
  | Flight (open-world only) | 104 |
  | Swarm only | 10 |

  Queue sizes: **Flight 210, Swarm 67**. (The review's 10/29/49/113/19 split predates
  `6dd2ceedceb2`, which moved the Line family and `lineHeads` into the combat scope; this pass
  also moved `capitalBossEncounters` into Swarm, where the wave director and `survivalWave` read
  its fights. That is why the live combat bucket is 38, not 29.)
- **One unknown-mode policy:** a mode with no pre-built partition dispatches an empty queue, and
  `shouldSkipSystemThisStep` / `shouldSkipSystemOnCatchup` skip every system for the same mode.
  The queue and the per-system skip can no longer disagree (E3 review F7).
- **A mode change is a clock discontinuity:** `updateQueueForThisStep` records the resolved mode
  per state and resets that state's calendar stamps/accumulators when it changes. The first
  resumed economy/automation/salvage/routeFollower call gets the fixed dt, not the skipped run
  duration (E3 review F2; regression in the focused suite).
- `getStepExecutionStats` is a pure derivation; it no longer writes `state.simModeRuntime`.

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

- Focused suite `test/finish-e3-mode-scoped-sim-and-lod.test.mjs`: **11/11**.
- `test/sim-step-profiler.test.mjs`: **5/5**.
- Core clock/manifest/activity set (see `VERIFY.md`): **119/119** across 11 files.
- `test/activity-runtime.test.mjs`: **32/32**; `test/activity-classification.test.mjs`: **12/12**.
- 47-A at 19:47 (this commit plus the then-current tree): expected hash
  `134e1e7f8296ed4c462d620421d8ec7102886ec629a39c9a0cd778a1f260aad5`, `deterministic: true`.
  A concurrent W1 Journey lane then wrote uncommitted `missions.js`/`missionStoryOps.js` act
  fields; the tape now drifts to `1fedbd09…` from those foreign files, not this commit. See
  `VERIFY.md` §3.

## Write claim

Released. Paths this campaign owns are the manifest, `catchupPolicy.js`, the two step hosts,
`simCoreFlags.js`, `activityRuntime.js`, the focused E3 test, and these campaign records.
