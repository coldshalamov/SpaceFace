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

## Next (order fixed by the spec)
1. Fence history ring (~16 packs) + delayed presented clock (adaptive 33–100 ms).
2. Extrapolation ≤ 150 ms; fixed-horizon smooth correction (80–120 ms); epoch/teleport snap kept.
3. Verify on the laptop with the same stall cycle: jump bound, no repeat-pose frames > 2,
   before/after video.

## Evidence
- `evidence/before-stall-trace.json` (+ `.devshots/e1-playout/before-*.png`, local).
- test/frame-truth.test.mjs (3/3), sim-worker-local-clock + sim-lane-stall-confirmation +
  worker-reply-work-budget (34/34).
