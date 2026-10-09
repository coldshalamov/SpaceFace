# src/observability/

Opt-in recorder and a pure session report. Not a registered system and not started by `main.js`.

- `sessionObserver.js` records only when a caller passes `enabled: true` and invokes the hooks.
- Samplers are pure reads. No RNG, no bus events, no wall time. Cadence is input every tick, state every 3, assets every 6, hash every 60, and only when `tick > 0`.
- Overflow drops new records, sets `overflowed`, and still advances `seq`. `validForRecording` is false if anything was dropped, a sampler threw, or the rate check failed.
- `sessionReport.js` is the pure transform `systems/telemetry.js` uses. Funnel timestamps are milliseconds. Targets in `FUNNEL_TARGETS_S` are seconds. Do not mix them. Unreached steps stay `-1`.
- No network and no PII. Proof: `node --test test/observatory-session-observer.test.mjs test/session-report.test.mjs`.
