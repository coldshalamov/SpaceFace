# E10 — Frame-truth dashboard: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done (2026-11-06)
- `src/core/frameTruth.js`: always-on recorder, preallocated typed rings (1800 frames ≈ 30 s,
  2048 worker replies). Columns: frame dt, rAF callback ms, present ms, sim steps, simTime/tick,
  reply age + worker workMs/stepsMs/packMs/applyMs, presented-clock delay/extrapolation/depth,
  player presented-pose x/z/speed, per-frame pose jump, held-pose frame classification, draws,
  triangles, 1 Hz heap.
- Worker-reply ingest hook in `simLaneMain.js` (`noteWorkerReply`, 2–10 Hz) + cheap
  `getFrameTruthSample()` per-present sampler (avoids the full `getDiagnostics()` allocation).
- Per-frame ingest in `presentationRunner.js` frame finally (guarded, allocation-free by default;
  heap sampled at 1 Hz because `performance.memory` costs ~50–90 µs).
- `snapshotFence.js`: module registry `getLatestSnapshotFence()` + `getPlayoutDiagnostics()`
  (delay/extrapolation/depth — populated by E1's delayed clock; E10 reads them).
- Overlay: Ctrl+Alt+F (or `?frameTruth=1`), 10 Hz dirty text updates, z-isolated, pointer-events
  none. Export: Ctrl+Alt+J / `window.__SF_FRAME_TRUTH__.exportJSON()` →
  `frame-truth-<stamp>.json` (columnar frames + reply ring + summary percentiles).
- Tests: `test/frame-truth.test.mjs` 2/2 green (ring wrap, hold-then-jump classification, reply
  intervals, export shape, null-probe robustness). Fence/lane suites re-run: 25/25 green.

## Next
- Cite in E1's before/after traces (first consumer). GPU-per-pass timers remain a renderer-owner
  item (Lane 3) — draw calls/triangles are recorded; pass-level GPU timing is not yet plumbed.
- Lane 2's per-system worker profiler fills the per-system columns when it lands (schema reserved
  via `perfRuntime.getReport().systems` in export-time `extra`).

## Evidence
- test/frame-truth.test.mjs (2/2), snapshot-fence-pose-epoch + snapshot-fence-span-alpha +
  sim-lane-stall-confirmation (25/25).
