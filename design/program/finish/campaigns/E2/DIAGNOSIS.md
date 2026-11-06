# E2 — Diagnose and replace the simulation hot path

Lane 2 (SIM CORE). Diagnosis memo, written before any optimisation, 2026-11-06.

## 1. The player-visible problem

The ship stops dead while planets, lights and particles keep moving, then blips to a new place.
Replies from the authoritative worker arrive at 2–10 Hz in busy scenes. The owner's words: "one
frame you can feel". The step is the driver — `packMs` is ~0.02 ms, so transport is not the cost.

## 2. Measured cause chain

Instruments used (built in this campaign, permanent):

- `src/core/simStepProfiler.js` — per-system wall time per tick plus per-tick allocation, in both
  realms (worker stepper and Node registry), off by default.
- `scripts/probe-sim-step.mjs` — boots the Node-safe production manifest, builds a heavy scene
  (211 live bodies: 160 drifting rocks + 14 hostile hulls + player), drives real input, exports
  `.devshots/sim-step-profile/<label>.json`.
- Sub-phase timers inside `physics` and `sg02` for the parts the system clock cannot split.

**Baseline, 900 measured ticks, seed 4242, 211 live bodies on this laptop:**

| step | mean | p50 | p95 | p99 | max | alloc |
|---|---:|---:|---:|---:|---:|---:|
| ms | 14.96 | 14.54 | 19.38 | 24.72 | 33.63 | 1.55 MB/tick |

Ranked by total measured time (1,700 ms of 13,480 ms is calendar/rare work):

| system | ms/tick | share | p95 |
|---|---:|---:|---:|
| `physics` | 4.76 | 31.8 % | 6.18 |
| `tacticalAI` | 2.10 | 14.5 % | 4.15 |
| `flight` | 0.80 | 5.5 % | 1.10 |
| `tetherGameplay` | 0.66 | 4.5 % | 3.17 |
| `weapons` | 0.45 | 3.2 % | 0.65 |
| `world` | 0.43 | 2.5 % | 0.61 |
| `rigWorkshop` | 0.30 | 2.1 % | 0.43 |
| `npcJobsRuntime` | 0.30 | 2.1 % | 0.42 |
| `economy` | **6.6 per call** | — | **52.6** |

`physics` splits (same run):

| phase | ms/tick |
|---|---:|
| `sg02.worldStep` — Rapier solve itself | 1.22 |
| `sg02.preStep` — per-record command/force prep | 0.75 |
| `sg02.publish` — enforce plane, clamp, entity sync, telemetry | 0.69 |
| `sg02.readback` — post-step WASM reads + structural give | 0.61 |
| authority sync / fence / reconcile overhead | 0.86 |
| spatial-hash rebuild | 0.17 |
| contact capture + emit | < 0.06 in this scene |

**So the solver is 26 % of the physics system. 74 % is JavaScript walking every body around it.**
That is the object-graph cost the master plan names, measured rather than argued.

Two single-tick spikes dominate the tail independent of the average: `economy`'s 5 s burst runs
once and costs **52.6 ms** in one step, and `tetherGameplay` p95 is 3.17 ms against a 0.66 ms mean.

## 3. Is the design the bottleneck?

Yes, in two distinct ways, and the answer differs per layer:

- **Physics glue.** One-JS-object-per-body means every post-solve concern (enforce plane, clamp
  speed, sync entity, publish telemetry, read back kinematics) is its own pass over 200–400
  objects, each pass chasing pointers and allocating. Replacing it with a structure-of-arrays
  store is campaign E4 and is the durable fix. It is *not* required to reach this campaign's bars:
  the same passes can be made cheaper in place by (a) not doing work nobody reads, and (b) keeping
  the per-record data hot. Cost of the full replacement: multi-session, whole-store migration with
  a facade. Bought: ~2.5 ms/tick here, and it is what makes 2× bodies affordable.
- **Per-tick spikes.** `economy` and the contact/impact fan-out are *shape* problems (an
  all-at-once burst; an event per contact to ~30 subscribers), not constants. Slicing and batching
  them is cheap and removes the p99/max tail. Cost: days. Bought: the 50 ms steps, which are what
  the player actually feels.

`tacticalAI` at 2.1 ms/tick is a third, separate subsystem; the campaign's rule is to fix only what
the profiler ranks top-five, which it is, so it gets a sub-phase split and a targeted fix, not a
rewrite.

## 4. The chosen road

Cheapest road to the *finished* result, in profiler order:

1. **Keep the profiler.** It is the campaign's instrument and the resume point for any agent.
2. **Telemetry and snapshots demand-driven** — nothing per body per tick that no live reader reads.
3. **One batched impact buffer per tick** replacing the `physics:impact` fan-out, with manifold
   queries deduped per collider pair. Consumers that only ask "did X hit hard" read a per-entity
   summary; the ~30 subscribers that need the receipt read the buffer once.
4. **Spikes → slices**: `economy`'s burst spread over a bounded number of steps with a work budget.
5. **Scans → indices** where the profile still shows a per-tick all-entity walk.
6. **Physics shape**: island sleeping for towed bodies, CCD only for fast small bodies, collision
   groups so debris/Brood do not pair with everything.
7. **E4 slice**: structure-of-arrays columns for the hot fields with a facade, hottest loop first.

Wrong ways this campaign will not take: optimising a system outside the top five; caching that
changes results; turning systems off instead of making them cheap; re-recording a determinism
reference to make a change pass.

## 5. What "done" means

Worker step p95 ≤ 8 ms, p99 ≤ 12 ms, max ≤ 25 ms on the Crucible ≥150-body round and the Adventure
busy route, measured on this laptop with the profiler export before/after, determinism suites
green, and the same bars still holding with 2× the bodies after E4.

## 6. Evidence pointers

- Baseline export: `.devshots/sim-step-profile/before-adventure.json`
- Baseline sub-phase export: `.devshots/sim-step-profile/smoke2.json`
- After exports: `.devshots/sim-step-profile/after-*.json`
- Status: [`STATUS.md`](./STATUS.md)
