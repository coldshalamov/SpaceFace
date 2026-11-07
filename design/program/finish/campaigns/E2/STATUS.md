# E2 — Hot path: status

Lane 2 (SIM CORE). Updated 2026-11-06.

## What landed

| # | Change | Files | Evidence |
|---|---|---|---|
| 1 | **Permanent per-system step profiler** — wall time per system per tick, per-tick allocation, rolling p50/p95/p99/max, exportable JSON. Off by default (one boolean read per step). Lives in the worker stepper (`createAuthoritativeStepper`) and every Node harness. **The main-lane `registry.js` is not wired to it** — that host keeps its existing `perfRuntime` system timings. | `src/core/simStepProfiler.js`, `src/core/authoritativeSimStep.js`, `src/core/sim.js`, `scripts/lib/simWorkerHost.mjs`, `src/core/simLaneMain.js` | `simLaneDiag().workerSystemProfile` in the browser; `host.systemProfile()` in Node |
| 2 | **Sub-phase attribution** inside the two systems the profile ranks first: `physics.{pre,authority,worldStep,hash,post,publish}`, `sg02.{preStep,worldStep,contacts,readback,publish}`, `economy.{sweep,events,pressure,drift,propagate}` | `src/core/physics.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/economy.js` | `.devshots/sim-step-profile/*.json` |
| 3 | **Probe harnesses** — `scripts/probe-sim-step.mjs` (Node production manifest, `--ab` for a matched in-process legacy-vs-simcore comparison) and `scripts/probe-step-acceptance.mjs` (Electron, real Adventure/Swarm routes, per-step normalised worker reply cost) | `scripts/` | `.devshots/sim-step-profile/`, `.devshots/sim-step-acceptance/` |
| 4 | **Physics telemetry is demand-driven behind a flag, shipped OFF** — the filter is implemented and three owners opt in (the Crucible room's jammed-shutter rule, the Kilnback capital's completion rule, the rig workshop's new-keel seed receipt). It defaults OFF because other shipped readers (buoy service, SG-02/SG-06 checks) still read the receipt without opting in; turning it on removes a player feature. The flag stays for a later pull-based migration, not as a claimed default win. | `src/core/physicsAuthority.js`, `src/core/sg02DynamicBodyOwner.js`, `src/core/simCoreFlags.js`, `src/systems/survivalArena.js`, `src/systems/runawayKilnRuntime.js`, `src/features/rigWorkshop/physics.js` | 47-A hash unchanged (see below); demand-off restores all five review-gate checks |
| 5 | **The quantized per-body SG-02 snapshot is lazy** — it is a checkpoint view (`snapshotSimState`), not per-tick sim state. The physics owner installs a lazy `physicsRuntime.sg02Snapshot` accessor (non-enumerable) backed by the same provider, so checks and probes that dereference the field still get the rows at the moment they ask, with no per-tick build. A host that explicitly opts in still gets a plain published array. | `src/core/physics.js`, `src/core/simSnapshot.js` | 47-A hash unchanged; `check-sg02-authority` reads the accessor |
| 6 | **Economy tick instrumented and de-duplicated** — one redundant `getCycleCore` + map walk per listing per economy tick removed by passing the live cycle the drift loop already resolved. | `src/systems/economy.js` | 47-A hash unchanged |
| 7 | **Economy spike slicing** — implemented (fixed-quantum resumable pass, deterministic, save-safe) and measured: the 130–150 ms economy step becomes ~3 ms spread over ~35 ticks. **Held off by default** — see the blocker. | `src/systems/economy.js`, `src/core/simCoreFlags.js` | `.devshots/sim-step-profile/econ-probe.json` |
| 8 | **Measurement switchboard** `simCoreFlags` — every optimisation can be turned off at boot so one process can run legacy and sim-core back to back on the same machine state. | `src/core/simCoreFlags.js` | `--ab` output below |

## Baseline (before any optimisation)

Node production manifest, 211 live bodies, 900 ticks, `.devshots/sim-step-profile/before-adventure.json`:

| step | mean | p50 | p95 | p99 | max | alloc |
|---|---:|---:|---:|---:|---:|---:|
| ms | 14.96 | 14.54 | 19.38 | 24.72 | 33.63 | 1.55 MB/tick |

`physics` 4.76 ms/tick (solver itself 1.22; JS glue 2.9), `tacticalAI` 2.10, `flight` 0.80,
`tetherGameplay` 0.66, `weapons` 0.45. `economy` costs **52–150 ms in a single step** every 5 s.

Browser route (Electron, worker lane), Adventure busy, `.devshots/sim-step-acceptance/before/`:
per-step worker cost **mean 34.6 → p50 30.9 / p95 47.2 / p99 54.1 / max 711 ms per reply**
(the reply carries a catch-up batch; this capture predates per-step normalisation and is kept only
as the run's raw record — the normalised series is what `probe-step-acceptance` now reports).

## Blockers, honestly

1. **The bars are still NOT MET.** The last matched in-process comparison
   (`.devshots/sim-step-profile/review-ab.json`, 211 bodies, 900 ticks, 256 sampled steps:
   legacy vs optimised in the same process seconds apart) gives the optimised shape
   **p95 24.16 ms / p99 48.85 ms / max 50.66 ms** against the **8 / 12 / 25 ms** bars.
   Mean 14.03 ms. `physics` 4.77 → 4.17 and `tacticalAI` 2.09 → 2.01 are not enough; the
   economy spike and the remaining physics glue are still the drivers. The review captured that
   ranking **before** the profiler preamble fix (review F6): `core.preStep`, `input` and the
   input-command publish are now recorded, so the next profile will show ~2 ms/tick that the
   quoted per-system shares understated. The step timings above are unaffected by measuring the
   preamble.
2. **The profiler is complete for the worker/Node lane, not for the main-lane registry.**
   `registry.js` never imported `simStepProfiler`; its per-system numbers come from
   `perfRuntime.recordSystem`. Wiring it would be a separate change and is not claimed here.
3. **Economy slicing needs a versioned 47-A reference.** Deferring a listing by ticks changes
   `state.simTime` reads inside demand/station-condition maths, so the 47-A determinism hash moves
   (`134e1e7…` → `2198d1e…`). `test/47a.telemetry.save-v23.expected.json` is the only file pinning
   it. The slice is implemented, deterministic, measured (130–150 ms → ~3 ms/call) and switched off
   behind `simCoreFlags.economySlicing`. **It remains off in this pass**; it is the next max/p99
   lever, not a default.
4. **Working-tree note.** `src/data/missions.js` has another lane's uncommitted edit in this shared
   checkout. The manifest/clock/activity suites named above still pass with it (119/119), so it did
   not affect this pass; the file was left untouched.

## Determinism

`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --hash --reload-at 600`
→ `134e1e7f8296ed4c462d620421d8ec7102886ec629a39c9a0cd778a1f260aad5`, byte-identical to
`test/47a.telemetry.save-v23.expected.json`, with `telemetryDemand` off (the shipped default),
`lazySg02Snapshot` on and the `effectiveEq` de-duplication on. Each of those was bisected
individually against the reference: all three are hash-neutral, as designed.

## Next

1. Flip `economySlicing` on and generate the versioned 47-A reference (`save-v24`), leaving v23 in
   place. This is the next max/p99 lever.
2. Capture a fresh worker/Node profile with the preamble rows included, then re-rank.
3. `tacticalAI`: sub-phase `liveStack.update` vs the cached-decision path, then fix the top entry.
4. `sg02.preStep` / `sg02.readback` / `sg02.publish` are the remaining per-record JS passes
   (2.0–3.2 ms/tick for 200–400 bodies). These are the E4 target: same passes over SoA columns.
5. Optionally wire the main-lane `registry.js` to `simStepProfiler` if its `perfRuntime` view
   proves insufficient.

## Where this landed

- The original E2 batch landed as commit `3c927c0d2ad8` on local `master` ("E2 sim core:
  permanent per-system step profiler + first hot-path cuts"), 19 paths, nothing else swept in.
- The E3 review-fix pass (telemetry default off + rig demand, lazy snapshot accessor, profiler
  preamble rows, clock-discontinuity reset) lands with the same paths named in the table above and
  the E3 campaign records. Publication remains with the integration owner; this shared checkout is
  not pushed from here.
- `src/systems/survivalArena.js` in the working tree carries another lane's S9 crush/slam work; the
  E2 commit deliberately contains only this campaign's two hunks in that file (import + telemetry
  opt-in). Do not sweep the file.
- The 47-A hash was re-verified in this pass with the working tree as it stands (including the
  telemetry-off default and the lazy snapshot accessor): exact expected hash, `deterministic: true`,
  exit 0.
