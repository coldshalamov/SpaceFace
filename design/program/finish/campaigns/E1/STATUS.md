# E1 — The playout buffer: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done
- Diagnosis memo committed (2026-11-06). Cause chain verified in code: presented clock chases the
  newest snapshot with a 100 ms extrapolation cap then holds; only 2 comparable packs exist;
  correction is a 4-frame catch-up leap. Journal records + packs already carry sim timestamps.

## Next (order fixed by the spec)
1. Stall-injection harness (`?simStall=`) FIRST; record "before" pose traces with the E10 trace.
2. Fence history ring (~16 packs) + delayed presented clock (adaptive 33–100 ms).
3. Extrapolation ≤ 150 ms; fixed-horizon smooth correction (80–120 ms); epoch/teleport snap kept.
4. Verify on the laptop: jump bound, no repeat-pose frames, before/after video.

## Evidence
- (pending harness)
