# E2 — Hot path: status

Lane 2 (SIM CORE). Updated 2026-11-06.

## What landed

| # | Change | Files | Evidence |
|---|---|---|---|
| 1 | **Permanent per-system step profiler** — wall time per system per tick, per-tick allocation, rolling p50/p95/p99/max, exportable JSON. Off by default (one boolean read per step). Lives in the worker stepper, the main-lane registry and every Node harness. | `src/core/simStepProfiler.js`, `src/core/authoritativeSimStep.js`, `src/core/sim.js`, `scripts/lib/simWorkerHost.mjs`, `src/core/simLaneMain.js` | `simLaneDiag().workerSystemProfile` in the browser; `host.systemProfile()` in Node |
| 2 | **Sub-phase attribution** inside the two systems the profile ranks first: `physics.{pre,authority,worldStep,hash,post,publish}`, `sg02.{preStep,worldStep,contacts,readback,publish}`, `economy.{sweep,events,pressure,drift,propagate}` | `src/core/physics.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/economy.js` | `.devshots/sim-step-profile/*.json` |
| 3 | **Probe harnesses** — `scripts/probe-sim-step.mjs` (Node production manifest, `--ab` for a matched in-process legacy-vs-simcore comparison) and `scripts/probe-step-acceptance.mjs` (Electron, real Adventure/Swarm routes, per-step normalised worker reply cost) | `scripts/` | `.devshots/sim-step-profile/`, `.devshots/sim-step-acceptance/` |
| 4 | **Physics telemetry is demand-driven** — a dynamic body publishes its frozen telemetry record only when a gameplay owner declared it inspects it (`requestPhysicsTelemetry`). Two readers exist: the Crucible room's jammed-shutter rule and the Kilnback capital's completion rule; both opt in where they bind the body. | `src/core/physicsAuthority.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/survivalArena.js`, `src/systems/runawayKilnRuntime.js` | 47-A hash unchanged (see below) |
| 5 | **The quantized per-body SG-02 snapshot is lazy** — it is a checkpoint view (`snapshotSimState`), not per-tick sim state. The physics owner now installs a provider and only materialises rows on demand or when a host explicitly opts in. | `src/core/physics.js`, `src/core/simSnapshot.js` | 47-A hash unchanged |
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

1. **The bars are not met.** p95 ≤ 8 ms / p99 ≤ 12 ms / max ≤ 25 ms needs `physics` 4.76 → ~2.5 and
   `tacticalAI` 2.10 → ~1.0 as well as the economy spike gone. This session landed the instrument,
   the ranking, and three of the five fixes; the two that remain are the two biggest.
2. **Economy slicing needs a versioned 47-A reference.** Deferring a listing by ticks changes
   `state.simTime` reads inside demand/station-condition maths, so the 47-A determinism hash moves
   (`134e1e7…` → `2198d1e…`). `test/47a.telemetry.save-v23.expected.json` is the only file pinning
   it. The slice is implemented, deterministic, measured (130–150 ms → ~3 ms/call) and switched off
   behind `simCoreFlags.economySlicing` until that reference decision is made. Landing it is a
   one-line flag flip plus one generated reference file.
3. **Environment note.** `src/data/missions.js` was being rewritten by another agent during this
   session and its working-tree copy imports modules by paths that do not resolve
   (`./kesslerScaleWorksite.js`, `./captainStandingOrders.js`), which fails
   `test/authoritative-manifest.test.mjs`, `test/sim-clock-catchup.test.mjs` and any Node boot that
   reaches it. That is not this lane's file and was left untouched. The 47-A determinism tape
   (`scripts/sf-sim.mjs run 47a`) passed **before** that write and reproduced the exact expected
   hash with every shipped flag on.

## Determinism

`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --hash --reload-at 600`
→ `134e1e7f8296ed4c462d620421d8ec7102886ec629a39c9a0cd778a1f260aad5`, byte-identical to
`test/47a.telemetry.save-v23.expected.json`, with `telemetryDemand`, `lazySg02Snapshot` and the
`effectiveEq` de-duplication all on. Each was bisected individually against the reference: all three
are hash-neutral, as designed.

## Next

1. Flip `economySlicing` on and generate the versioned 47-A reference (`save-v24`), leaving v23 in
   place.
2. `tacticalAI`: sub-phase `liveStack.update` vs the cached-decision path, then fix the top entry.
3. `sg02.preStep` / `sg02.readback` / `sg02.publish` are the remaining per-record JS passes
   (2.0–3.2 ms/tick for 200–400 bodies). These are the E4 target: same passes over SoA columns.

## Where this landed

- Commit `3c927c0d2ad8` on local `master` ("E2 sim core: permanent per-system step profiler + first
  hot-path cuts"), 19 paths, nothing else swept in.
- **Not pushed.** Local `master` is 68 commits ahead of `origin/master` with another lane's
  unpublished integration batch, and two of this batch's paths (`scripts/lib/simWorkerHost.mjs`,
  `src/systems/survivalArena.js`) carry that lane's unpublished hunks in the working tree. Publishing
  from `origin/master` would have reverted their hunks in those two files, so publication is left to
  the integration owner.
- `src/systems/survivalArena.js` in the working tree carries another lane's S9 crush/slam work; the
  commit deliberately contains only this campaign's two hunks in that file (import + telemetry opt-in).
- Re-verification of the 47-A tape after the commit was impossible: `src/data/missions.js` in the
  working tree is being rewritten by another lane and does not resolve its own exports. The hash check
  quoted above was taken with the same shipped code, before that rewrite began.
