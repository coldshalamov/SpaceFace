# report — salvage-unstable-quiet-empty-latch

See DONE.md for headline numbers. Artifacts:

- `artifacts/salvage-unstable-quiet-empty-latch-microbench.json`
- `artifacts/salvage-unstable-quiet-empty-latch-floor-summary.json`
- `artifacts/focused-tests-salvage-unstable-quiet-empty-latch.log`

Dirty-wake: reactor arm via `configureAuthoredWreck({ reactorTimerS })`
clears latch; burst fires when `simTime >= dueAt`.
