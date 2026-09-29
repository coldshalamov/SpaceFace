# Wave-4 Lane Report — Catch-up Step Batching

Lane question: *can consecutive pending sim ticks be batched into one pass inside
virtualized jobs (or elsewhere on the catch-up path) where the batch is provably
output-identical — or do per-tick semantics forbid it?*

Branch: `devin/1790658086-w4-catchup` off `origin/master` (b34f91e92).

## Verdict

**AUDIT — everything batchable is already batched; the remaining per-tick work is
semantic.** Every virtualized domain already performs its catch-up as a single
aggregated pass whose output is provably identical to stepping (the job kernel's
documented decomposability invariant, closed-form ballistic drift, and the sector
model's elapsed-time integration). The one place N pending ticks still pay N
sequential step costs — the main-thread `advanceFixedTimestep` loop — cannot be
fused: each `registry.step` is a 60 Hz *semantic* boundary (RNG draw order,
per-tick input snapshot publication, TTL/event ordering, pose + dirty-journal
marks consumed same-tick, calendar cohorts keyed on `tick % 30`, fixed-dt
integrator state). Measured on the populated 47a world, the only overhead a
hypothetical fusion could even reach is ~8.5 µs of runner bookkeeping per step —
~1.3 % of a 4-step catch-up frame — and removing it would still break the
completed-tick / input-command sequence contracts. The lane's documentation
obligation lands in `catchupPolicy.js` (ticks are atomic, never fused) with this
report as the evidence.

## Research citations

- **Gaffer on Games — "Fix Your Timestep!"** (gafferongames.com/post/fix_your_timestep):
  the accumulator pattern this codebase implements (`advanceFixedTimestep`),
  and the *spiral of death* it protects against — sim work that exceeds real time
  compounds forever. Gaffer's answer is a step cap + shed; this codebase's answer
  is `MAX_CATCHUP_STEPS = 4`, `HITCH_FRAME_TICKS = 6.5` → `HITCH_CATCHUP_STEPS = 2`,
  and whole-step debt shedding that keeps the sub-tick remainder.
- **Unity `Time.maximumDeltaTime` + `FixedUpdate` catch-up** (docs.unity3d.com —
  "Time and frame rate management"): the industry-standard shape — run N fixed
  steps to catch up, cap the debt (Unity: `maximumDeltaTime/fixedDeltaTime`),
  shed the rest. SpaceFace matches it; the per-step queue partition
  (TABLE-only on catch-up) is the same answer Unity gives via fewer callback
  bodies per fixed step.
- **GGPO rollback SDK — DeveloperGuide** (github.com/pond3r/ggpo): the canonical
  proof that a deterministic tick is indivisible — rollback "fast-forward"
  re-executes *every* frame sequentially because frame boundaries carry inputs
  and ordering. Nothing in lockstep/rollback literature merges ticks; merging is
  precisely what determinism forbids.
- **EVE Online "Time Dilation" (TiDi)** (eveonline.com/news): the server-scale
  answer — when the sim cannot catch up, *dilate time* rather than batch ticks.
  The equivalent client-side choice here is the step cap + shed (bounded
  temporal debt, no unbounded replay).
- **In-repo prior art** — the virtualized domains this lane was scoped to:
  `npcJobs.js` kernel contract ("ADVANCEMENT IS DECOMPOSABLE.
  advance(j,a) then advance(j,b) == advance(j,a+b)" — no RNG/wall-time inside
  `advance`), consumed by `npcJobsRuntime._tryRelink`'s single aggregated
  `advance(entry.job, elapsed)`; `sectorSim._advanceModel(days)` once per
  accumulated interval (offline catch-up is one call); `activityRuntime.
  catchUpEntity` = one closed-form `ballisticDrift` per shelved actor.

## Assessment — what already batches

| Domain | Catch-up mechanism | Why it is provably identical |
|---|---|---|
| Virtualized NPC jobs (offscreen/away) | `_tryRelink` calls `advance(entry.job, elapsed)` **once** for the whole interval, `elapsed` capped at `MAX_CATCHUP_S` | kernel invariant: `advance(j,a+b) ≡ advance(j,a);advance(j,b)` — no RNG, no wall-clock sampling inside |
| Far actors (shelved) | no stepping at all; `catchUpEntity` = one `ballisticDrift(…, dt)` extrapolation; records project at read time (`ledgerPredictedPos`) | closed-form integration — position is a pure function of elapsed time |
| Sector economy model (offscreen) | accumulates sim seconds, integrates once per 60 s boundary via `_advanceModel(days)`; load-time offline catch-up is one `_advanceModel(days)` call | the model is already written as "advance by Δ", not "step N times" |
| Cadence systems (e.g. `asteroidSites`) | accumulate `dt`, collapse the debt to one effective step, shed beyond ~4× | subsystem-visible state is cadence-quantized by design |
| Main-thread catch-up | up to `MAX_CATCHUP_STEPS` sequential `registry.step`s, TABLE-clock only | **not batchable — per-tick semantics (below)** |

## Assessment — why the main-thread tick cannot be fused

Each `registry.step(dt)` carries semantics keyed to the tick index:

1. **Deterministic ordering**: RNG draws, bus event publication order, TTL decay,
   and corpse compaction happen per tick inside `preStep`/`lifetimeSweep` and each
   system. Two fused steps would reorder/dedupe draws and events → different hash.
2. **Input snapshot contract** (`simulationRunner.stepSimulation`): every step
   reserves, captures, and consumes exactly one `InputCommandSnapshot` (PQ-160
   replay tape). The boundary throws on `publishedSequence !== sequence` — the
   queue is literally designed to *reject* fused publication.
3. **Per-tick pose + dirty journal**: `preStep` snapshots prevPos/prevRot and marks
   `DIRTY.POSE`; TABLE systems read the journal same-tick (e.g.
   `combat.js` `isDirty(DIRTY.COMBAT|DIRTY.POSE)` gate). Skipping intermediate
   marks changes within-tick system behavior, and skipping intermediate pose
   snapshots corrupts the interpolation endpoint (the last tick's pair must be
   exact — the renderer interpolates against `accumulator/dt`).
4. **Calendar cohorts**: `tick % 30 ∈ {0,10,20}` straddle means a fused "4-tick
   pass" cannot know which cohort fires — each fused tick has a different cohort.
5. **Fixed-dt integration**: physics/flight integrate at dt=1/60; a fused dt=4/60
   is a *different* trajectory (contact resolution, tunneling) — the exact
   determinism-vs-dt problem Gaffer's article exists to name.
6. **Observability sequences**: `completedSequence`/`inputSequence` count steps;
   presentation consumes per-tick journal brackets (`journalStart` of the first
   pending record, `journalEnd` of the last). Fusing renumbers the sequence
   stream visible to replay/diagnostics.

Micro-batching the bookkeeping instead (reserve/capture/consume/publish once per
frame) was evaluated: savings ≈ `runnerBookkeepingResidualUs × (N−1)` ≈ 25 µs on
a 4-step frame (~1.3 %), still contract-bound, so not worth the seam.

## Profile evidence

Instrument: `scripts/probe-catchup-cost.mjs` — rebuilds the real
`createSimulationRunner` + `advanceFixedTimestep` catch-up loop against the
golden legacy47a system set, replays `test/47a.inputs.json` for warmup (23 live
entities — the golden's end-state count), then measures forced-behind frames
with per-phase attribution (median of 120 interleaved rounds; box: Windows,
Node 20.19 — absolute µs are box-relative, ratios are the evidence):

| Scenario | advance() median | steps | shed |
|---|---|---|---|
| primary frame (1 tick owed) | **0.55 ms** | 1 | 0 |
| 4-tick catch-up frame | **1.99 ms** | 4 | 0 |
| hitch frame (7 ticks owed, cap 2) | **1.02 ms** | 2 | 5 |

Per-step medians: primary (full queue) **535 µs**; catch-up (TABLE-only) **432 µs**
— the NEAR/CALENDAR partition already saves ~19 % per catch-up step.

Catch-up step composition (µs, means): physics 287 · flight 92 · combat 34 ·
weapons 16.5 · actions 3.2 · `core.preStep` 17.5 · `core.lifetimeSweep` 12.5 ·
input boundary publish+capture ~10 · runner bookkeeping residual ~8.5.
→ ~430 µs of irreducible per-tick semantics vs ~47 µs of wrapper — and every
wrapper fragment is itself contract-bound (§above). Fusable overhead: ~0.

Standalone microbenches: `InputCommandSnapshotQueue` publish+consume ≈ 1.2 µs/step;
`stampNearWorkBudget` ≈ 0.28 µs on this world (early-breaks at 16 grants; its
catch-up-step rebuild is dead work but the same walk lazily fills
`_nearWorkAlwaysAwake` — skipping it risks a different cached bit after a
mid-batch combatant flip → nearWorkIds divergence → rejected).

Inspected and not a target: `npcJobsRuntime` per-tick `_tryRelink` for still-
unlinked in-sector entries is an O(living-actors) scan per unlinked virtual job
per primary tick — transient (entries link on first match) and bounded.

## Patch

- `src/core/catchupPolicy.js` — header note: the 60 Hz tick is the atomic
  deterministic unit; catch-up steps run as N sequential steps, never fused
  (with the enumerated contract reasons + report pointer). Comment-only.
- `scripts/probe-catchup-cost.mjs` — new measurement instrument (this report's
  numbers are reproducible via `node scripts/probe-catchup-cost.mjs`).
- `design/perf/w4-catchup-REPORT.md` — this file.

No sim-path behavioral change. The per-tick fusion ban was already enforced by
construction (input-snapshot exactly-once publish); the comment now names it so a
future lane does not re-litigate.

## Metrics

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0 — verified on this branch (comment + probe only).
- **Catch-up A/B (forced-behind)**: see Profile evidence — a 4-tick catch-up
  frame costs ~4× a primary step (1.99 ms vs 0.55 ms); the gap between a
  catch-up step and a primary step (432 vs 535 µs) is the NEAR/CALENDAR work the
  clock partition already removes.
- **Fused-batch upper bound** (if it were legal): ≤ ~25 µs per 4-step frame
  (~1.3 %) — below the contract cost of breaking the snapshot sequence.
- **Unit tests**: `test/catchup-spiral.test.mjs` pins the skip semantics and the
  per-step `simCatchupIndex` numbering (0,1,2…); unchanged and passing.

## Zero visible quality change

No draw-path, sim-path, or content change; one header comment, one probe script,
one report. Rendering, interpolation, and sim behavior are byte-identical to
`master`.
