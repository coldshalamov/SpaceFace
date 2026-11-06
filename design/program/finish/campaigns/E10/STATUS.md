# E10 — Frame-truth dashboard: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done
- Diagnosis memo committed (2026-11-06): inventory of the six scattered probes; one
  recorder + overlay + JSON-export road chosen.

## Next
1. `src/core/frameTruth.js`: preallocated recorder (ring, ~1800 frames), ingest points =
   presentationRunner (frame callback, present ms, completed-tick arrival), simLaneMain
   diagnostics (workerLastReplyWork, freeze episodes), fence (pack bytes, presented clock,
   extrapolation state).
2. Overlay (`?frameTruth=1` / Ctrl+Alt+F), dirty-gated DOM.
3. `exportJSON()` trace; cite in E1's before/after.

## Evidence
- (none yet — recorder not built)
