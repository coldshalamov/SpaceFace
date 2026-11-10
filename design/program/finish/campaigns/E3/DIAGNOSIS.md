# E3 — Mode-scoped simulation and simulation LOD

Lane 2 (SIM CORE). Diagnosis memo, 2026-11-06.

## 1. The player-visible problem

A Swarm round and an Adventure flight run the same 205-system tick. The Crucible has no sectors,
no mission board, no jobs, no economy, no faction courts — but the round pays for all of them
every step, and the step is already the reason the ship freezes (see `../E2/DIAGNOSIS.md`).

## 2. Measured cause chain

From `.devshots/sim-step-profile/before-adventure.json` (Node production manifest, 211 bodies):

- 205 update-order systems run per step. The largest 12 account for 68 % of the step; the other
  193 account for 32 % — about **4.6 ms/tick** of systems that no single one of costs more than
  0.3 ms. A Swarm round needs maybe 40 of them.
- The codebase already pays for the wrong-mode work twice: ~40 systems open their `update()` with
  `state.run?.kind === 'survival' && state.run.phase !== 'inactive' → return`. That guard is the
  evidence that those systems are Adventure-only, and it is also proof that **skipping the call in a
  Swarm round is behaviour-identical** — the body would have returned before touching state.
- Calendar-owner work is already rate-split (`CALENDAR_CLOCK_IDS`, cohorts, sub-phases,
  `strideDt`), measured at 8.11 ms max before the split vs 2.49 ms p50 after. So the *rate* half of
  this campaign exists; the *mode* half does not.

## 3. Is the design the bottleneck?

Yes — the implicit "every system every tick" default is the design. A per-system `if (mode)` is the
wrong fix (261 copies of the same predicate, invisible load, untestable). The right fix is a
manifest: the tick chooses a system set from a declaration, once, not per system.

Cost of the replacement: one new module plus a filtered queue in the two step hosts — days, not
weeks. It buys: a Swarm round that only runs Swarm systems, and the structure Adventure's far-field
LOD needs (a place to declare a rate per mode).

## 4. The chosen road

1. `src/runtime/simModeManifest.js` — `SIM_MODE` ids, `simModeFor(state)`, and an explicit
   id → modes declaration. **Default is "runs in every mode"**: a forgotten entry costs time, never
   correctness. Only ids whose own `update()` already refuses to work outside their mode are listed
   as excluded, each with the reason.
2. Step hosts (`createSimulation`, `createAuthoritativeStepper`) select the mode's filtered queue.
   The mode is recomputed on mode change only (run start/end, dock, race lease); the per-tick cost
   is one string compare.
3. Production-profile guard and a single kill switch, matching the calendar-clock contract.
4. Simulation LOD for Adventure: far-field bookkeeping already strides; the manifest is where a
   system declares `hz` so the remaining per-tick Adventure censuses can move down a rate without
   touching their bodies.

Wrong ways this campaign will not take: hard-coding `if (mode === 'swarm') return` in systems;
deleting systems instead of scoping them; changing Swarm results.

## 5. What "done" means

The profiler shows a Swarm round touching only the Swarm manifest; an Adventure soak shows no
behaviour change in visible space (determinism references for near-field unchanged, far-field ones
versioned, never overwritten).

## 6. Status

See [`STATUS.md`](./STATUS.md).
