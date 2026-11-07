# E2 — Hot path: status

Lane 2 (SIM CORE). Updated 2026-11-06 after the E2/E3 re-review.

## What landed

| # | Change | Files | Evidence |
|---|---|---|---|
| 1 | **Permanent per-system step profiler** — wall time per system per tick, per-tick allocation, rolling p50/p95/p99/max, exportable JSON. Off by default (one boolean read per step). Lives in the worker stepper (`createAuthoritativeStepper`) and every Node harness. **The main-lane `registry.js` is not wired to it** — that host keeps its existing `perfRuntime` system timings. | `src/core/simStepProfiler.js`, `src/core/authoritativeSimStep.js`, `src/core/sim.js`, `scripts/lib/simWorkerHost.mjs`, `src/core/simLaneMain.js` | `simLaneDiag().workerSystemProfile` in the browser; `host.systemProfile()` in Node |
| 2 | **Sub-phase attribution** inside the systems the profile ranks first: `physics.{pre,authority,worldStep,hash,post,publish}`, `sg02.{preStep,worldStep,contacts,readback,publish}`, `economy.{sweep,events,pressure,drift,propagate,slice}` | `src/core/physics.js`, `src/core/sg02DynamicBodyOwner.js`, `src/systems/economy.js` | `.devshots/sim-step-profile/*.json` |
| 3 | **Probe harnesses** — `scripts/probe-sim-step.mjs` (Node production manifest, `--ab` for a matched in-process legacy-vs-simcore comparison) and `scripts/probe-step-acceptance.mjs` (Electron, real Adventure/Swarm routes, per-step normalised worker reply cost) | `scripts/` | `.devshots/sim-step-profile/`, `.devshots/sim-step-acceptance/` |
| 4 | **Physics telemetry is demand-driven behind a flag, shipped OFF** — the filter is implemented and the shipped readers opt in (the Crucible room's jammed-shutter rule, the Kilnback capital's completion rule, the rig workshop's new-keel seed receipt including restored pending seed edits). It defaults OFF because other shipped readers (buoy service, SG-02/SG-06 checks) still read the receipt without opting in; turning it on removes a player feature. | `src/core/physicsAuthority.js`, `src/core/sg02DynamicBodyOwner.js`, `src/core/simCoreFlags.js`, `src/systems/survivalArena.js`, `src/systems/runawayKilnRuntime.js`, `src/features/rigWorkshop/physics.js` | 47-A hash unchanged by the demand flag; demand-off restores all five review-gate checks |
| 5 | **The quantized per-body SG-02 snapshot is lazy** — it is a checkpoint view (`snapshotSimState`), not per-tick sim state. The physics owner installs a lazy `physicsRuntime.sg02Snapshot` accessor (non-enumerable) backed by the same provider, so checks and probes that dereference the field still get the rows at the moment they ask, with no per-tick build. The snapshot reader now reads the accessor once instead of twice in the true branch. | `src/core/physics.js`, `src/core/simSnapshot.js` | 47-A hash unchanged; `check-sg02-authority` reads the accessor |
| 6 | **Economy tick instrumented and de-duplicated** — one redundant `getCycleCore` + map walk per listing per economy tick removed by passing the live cycle the drift loop already resolved. | `src/systems/economy.js` | v24 envelope; the economy content delta is expected |
| 7 | **Economy spike slicing, fixed by a per-fixed-tick drain** — the economy owner is a 2 Hz calendar system, so a many-advance pass could outlive its 5 s due period and the next due tick replaced it. The slice now advances once per fixed tick through `partitionUpdateSystems.drainStep` (called by every host), the quantum is 3 advances/phase (9 maximum, ~0.15 s at 60 Hz), a due tick that lands mid-pass is carried instead of dropped, `ticksElapsed` counts completed passes only, and `serialize()` snapshots the pass cursor without advancing or emitting. **The flag is held OFF**: the drain and its 2100-tick/60 s cadence tests are green behind `economySlicing`, but the shared 47-A tape is currently contaminated by foreign working-tree changes, so a clean v26 cannot be recorded honestly. v24 stays active. | `src/systems/economy.js`, `src/core/catchupPolicy.js`, `src/core/sim.js`, `src/core/authoritativeSimStep.js`, `src/core/registry.js`, `src/core/simCoreFlags.js`, `test/economy-slice-cadence.test.mjs` | `econ-drain-ab.json` (flag-on A/B); cadence tests set the flag explicitly |
| 8 | **Measurement switchboard** `simCoreFlags` — each optimisation can be turned off at boot so one process can run legacy and sim-core back to back on the same machine state. Defaults are stated per flag; `telemetryDemand` is deliberately OFF. | `src/core/simCoreFlags.js` | `--ab` output below |

## Baseline (before any optimisation)

Node production manifest, 211 live bodies, 900 ticks, `.devshots/sim-step-profile/before-adventure.json`:

| step | mean | p50 | p95 | p99 | max | alloc |
|---|---:|---:|---:|---:|---:|---:|
| ms | 14.96 | 14.54 | 19.38 | 24.72 | 33.63 | 1.55 MB/tick |

`physics` 4.76 ms/tick (solver itself 1.22; JS glue 2.9), `tacticalAI` 2.10, `flight` 0.80,
`tetherGameplay` 0.66, `weapons` 0.45. `economy` costs **52–150 ms in a single step** every 5 s.

## Current shape (matched A/B, loaded shared checkout)

`.devshots/sim-step-profile/econ-drain-ab.json` — production manifest, 211 live bodies, 900
measured ticks, legacy arm with `economySlicing:false`, optimised arm with the drained slice,
both in one process. The checkout was busy during this capture, so the absolute tails are
inflated; compare only the arms and the economy rows.

| step | mean | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|
| legacy | 46.739 | 22.771 | 147.238 | 308.371 | 652.017 |
| drained slice | 20.885 | 16.432 | 51.071 | 113.259 | 142.672 |

Economy rows (per call):

| row | legacy | drained |
|---|---:|---:|
| `economy` | 14.052 | 0.027 |
| `economy.drift` | 56.405 | 3.815 |
| `economy.pressure` | 81.112 | — (regional/industry slices) |
| `economy.slice` | — | 10.432 |
| completed passes (`economy.propagate`) | 3 | 3 |

The earlier single-arm `econ-slice-on.json` (mean 8.744 / p95 13.794 / p99 17.667 / max 28.993)
measured `economy.drift` **once / 0 ms** and `economy.propagate` **once** in 900 ticks: it was an
incomplete pass, not a shipped-shape win. Do not cite it as one. `review-ab.json` is the older
matched capture of the same incomplete shape; it is not the provenance for the current numbers.

## Blockers, honestly

1. **The bars are still NOT MET: 8 / 12 / 25 ms (p95 / p99 / max).** The current matched capture
   reads 51.071 / 113.259 / 142.672 ms on a loaded checkout. That is a relative improvement, not a
   clean acceptance number. Re-run `probe-sim-step.mjs --ab` on an idle checkout before claiming
   the floor.
2. **The profiler is complete for the worker/Node lane, not for the main-lane registry.**
   `registry.js` keeps `perfRuntime` system timings; wiring the step profiler there is a separate
   change and is not claimed here. Per-system percentiles are **per call** (`basis: 'per-call'`);
   `meanMsPerTick` amortises a calendar owner over measured ticks and the step row is per tick.
3. **Economy slicing is implemented and verified behind the flag, but the shipped default stays
   OFF.** The cadence suite sets `economySlicing: true` explicitly: 2100 production ticks emit 7
   receipts (35 s), 60 s emits 12, drift/slice sub-phases run, no due tick is entered while a pass
   is in flight, and the save cursor resumes. The 47-A tape at this shared checkout is red for a
   foreign reason (`src/data/newGameDefaults.js` shield swap + `src/systems/input.js` travel-latch
   edit), so a v26 recorded here would bake someone else's gameplay change into the reference.
   v24 `1fedbd09…` stays active; v25 `080c5bd9…` is the obsolete un-drained shape and is kept as
   history only. Re-enable after a clean-tree v26 re-record and a fresh profile.
4. **Telemetry stays demand-driven and OFF by default.** `simCoreFlags` no longer claims every flag
   is ON; the header names the per-flag defaults.

## Determinism

The active 47-A reference remains **v24** (`1fedbd09dc3d8b70c4c392f6258b44f41a3969295e2df550b5eeeaa723084331`,
v3 native-contact `015c4c…`). The current shared checkout cannot reproduce it because of foreign
uncommitted edits (`src/data/newGameDefaults.js` starter shield and `src/systems/input.js` gamepad
travel-latch); the same foreign tree also moves `combat:damage`/`projectile:hit` and presentation
counts. That is not this campaign's change, and no golden was re-recorded to hide it.

The flag-on cadence proof is `test/economy-slice-cadence.test.mjs`: 2100 production ticks emit
`floor((simTime + 1e-6)/5)` receipts (7), the 60 s run emits 12, drift and slice sub-phases have
non-zero calls, no due tick is entered while a pass is in flight, `serialize()` neither advances
nor emits, and a restored cursor matches an uninterrupted pass. The flag-on 47-A run is
deterministic and reload-equal (`fb76e5b9…` legacy / `f06c59d5…` v3) but is not a reference until a
clean tree confirms it.

## Next

1. Re-run the matched A/B on an idle checkout and record a clean max/p99 floor.
2. `tacticalAI`: sub-phase `liveStack.update` vs the cached-decision path, then fix the top entry.
3. `sg02.preStep` / `sg02.readback` / `sg02.publish` are the remaining per-record JS passes
   (2.0–3.2 ms/tick for 200–400 bodies). These are the E4 target: same passes over SoA columns.
4. Optionally wire the main-lane `registry.js` to `simStepProfiler` if its `perfRuntime` view
   proves insufficient.

## Where this landed

- The original E2 batch landed as commit `3c927c0d2ad8` on local `master` ("E2 sim core:
  permanent per-system step profiler + first hot-path cuts"), 19 paths, nothing else swept in.
- The E3 review-fix pass (telemetry default off + rig demand, lazy snapshot accessor, profiler
  preamble rows, clock-discontinuity reset) lands with the same paths named in the table above and
  the E3 campaign records.
- The economy drain fix (this pass) adds the per-fixed-tick drain, save cursor, cadence test, and
  the flag-on A/B evidence. The flag stays off until a clean-tree v26 reference can be recorded;
  v23/v24/v25 envelopes are untouched and their reference metadata now describes the real changes.
- Publication remains with the integration owner; this shared checkout is not pushed from here.
