# E1 — The playout buffer: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done
- Diagnosis memo committed (2026-11-06). Cause chain verified in code: presented clock chases the
  newest snapshot with a 100 ms extrapolation cap then holds; only 2 comparable packs exist;
  correction is a 4-frame catch-up leap. Journal records + packs already carry sim timestamps.
- **Stall-injection harness landed (BEFORE the playout change)**: `?simStall=<csv cycle>` — the
  browser worker blocks its event loop for the requested ms per local-clock tick (Atomics.wait;
  busy-loop fallback), the faithful emulation of a heavy authoritative step. Flag parse +
  bounds tested; stall counters ride `clockDiagnostics` (`stallApplications`, `stallTotalMs`).
- **BEFORE trace recorded on this laptop** (2026-11-06, Browser pane visible, dev server, new
  game → flight at ~195 wu/s, cycle 60,60,60,400):
  `evidence/before-stall-trace.json` (1800 frames, 1890 replies).
  - Longest held-pose streak while moving: **26 frames** (~430 ms).
  - Frames violating max-jump ≤ 2×speed×dt: **78** (worst ratio 2.0).
  - Worker reply work p50 21.8 / p95 35.9 / **max 698 ms**; reply interval p50 102 ms,
    p95 451 ms, **max 5.9 s**.
  - The presented clock read 60 ms behind the newest pack with depth 1 pack — zero tolerance
    for exactly this arrival jitter.
- **Playout buffer implemented in `src/render/snapshotFence.js`** (the agreed pose-writer
  interface; renderer callers unchanged):
  - History ring 3 → **18 packs** (~300 ms at pack-per-tick); pack cost unchanged.
  - Presented clock plays at `newestPack − playoutDelay` (adaptive **33–100 ms**, start 50 ms);
    delay grows +8 ms per commit that lands with the buffer dry, eases −2 ms with headroom.
  - Rate modulation: as the runway (history + extrapolation) drains the clock slows toward
    0.15×, so a deep stall reads as brief slow motion, never a frozen ship.
  - Interpolation between the history packs bracketing the presented moment; extrapolation
    ≤ **150 ms** past the newest sample along per-row velocity (EXTRAPOLATION_MAX_WU teleport
    guard kept); gap re-seat is a no-overshoot exponential (τ = 30 ms ≈ 90 ms settle).
  - Snap only on flagged discontinuities: pose-epoch change (sector jump/rebuild), clock
    rewind, extrapolated-travel overflow.
  - `latestSnapshot()/previousSnapshot()` now serve the PRESENTED bracket (the pose-apply
    contract is unchanged for the renderer); `newestSnapshot()` serves the pack writers so
    clean-row copies never regress in time; `fence.sequence` reads as the presented bracket's
    sequence while a sample is active (the renderer's `_snapshotPresentationSequence`
    comparison keeps choosing the presented alpha).
  - `presentedRowPose(entityId)` exposes the pose the player actually saw (E10's hold/jump
    metric reads it; the mirrored row still updates at reply rate and is NOT the picture).
- Tests: `test/snapshot-fence-playout-buffer.test.mjs` (3/3: late-burst-in-history with the
  jump bound, presented-vs-newest accessors, adaptive delay grow/shrink) +
  `snapshot-fence-span-alpha`/`pose-epoch` updated to the deliberate contract changes
  (extrapolation bound 100→150 ms per the master plan; rewind reset re-seats at
  newest−delay clamped to history) — 18/18 green; frame-truth 6/6; full transport cohort
  55/55 green.

## Next
1. Done — see below. Remaining (optional hardening, not the Verify bar): smoothing the burst
   case further by packing fence snapshots per consumed tick from journal TRANSFORM history
   (today a catch-up burst lands as one pack spanning several ticks; the buffer interpolates
   linearly across it — monotone and jump-free, just linearized). Lane 2's E2 profiler export
   will feed E10's per-system columns.

## Verify — met (2026-11-06, measured on this laptop, Browser pane visible)

Stall pattern `?simStall=60,60,60,400` (one 400 ms stall every 4th tick) in every run.

| Metric (spec bar) | BEFORE (`before-stall-trace.json`) | AFTER clean run (`after-stall-trace.json`) | AFTER video window (`after-video-window-trace.json`) |
|---|---|---|---|
| Max per-frame pose jump ≤ 2×speed×frameDt | 13.0 wu, **78 violations** (worst ratio 2.01) | 6.1 wu, **0 violations** | 22.0 wu, **0 violations** |
| Held-pose frames while moving (≤ 2) | **26-frame streak** | **0** | **0** |
| Conditions | worker lane, reply gaps p50 102 / p95 451 / max 5.9 s | worker lane, reply gaps p50 128 / p95 483 / max 3.4 s | extreme load (frame callback max 2.6 s, other agents compiling), lane fell back to in-process mid-window |

- **Before/after video of the same stall pattern**: `evidence/before-playout-0-stalls.mp4` +
  `evidence/after-playout-buffer-stalls.mp4` — same binary, same harness, same route
  (new game → cruise 195 wu/s in open space); the before take uses the in-fence diagnostic
  kill-switch `?playout=0` (legacy chase-the-newest clock), the after take is the playout
  buffer. Before: 5 fps, pose repeating under load; after: 15 fps, continuous motion.
  Frames verified (speed pinned at 195 U/S through both windows).

## Evidence
- `evidence/before-stall-trace.json`, `evidence/after-stall-trace.json`,
  `evidence/after-video-window-trace.json`, both videos.
- Tests: 18/18 fence (incl. `snapshot-fence-playout-buffer.test.mjs`), 6/6 frame-truth,
  34/34 transport. Full node suite re-run blocked transiently by concurrent agents'
  in-flight data-graph edits (documented where hit); fence/transport/frame-truth cohorts green.
- The kill-switch `?playout=0` is a permanent diagnostic seam (fence reads the URL once at
  creation; production default unchanged).
