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
1. **Live AFTER re-record** with the corrected presented-pose metric (the first AFTER run,
   `evidence/after-stall-trace.json`, measured the mirrored row — valid for BEFORE's
   presentation where mesh ≈ newest pack, invalid after the buffer). Blocked only by machine
   congestion: the shared dev server intermittently 404s and the worker's ~14 s boot loses
   the lane's 5 s startup deadline while other agents compile. Retry when quiet.
2. Before/after video of the same stall pattern (spec Verify).
3. First-AFTER row-proxy observations (presented-pose fix landed mid-session): held streak
   26 → 3–6 frames, jump-bound violations 78 → 2 (worst ratio 2.0 → 1.04) under reply gaps
   p50 128 / p95 484 ms — consistent with the unit contract; the clean re-record replaces it.

## Evidence
- `evidence/before-stall-trace.json` (+ `.devshots/e1-playout/before-*.png`, local).
- `evidence/after-stall-trace.json` (row-proxy metric; superseded by pending re-record).
- Tests: 18/18 fence, 6/6 frame-truth, 34/34 transport (sim-worker-local-clock +
  sim-lane-stall-confirmation + worker-reply-work-budget).
