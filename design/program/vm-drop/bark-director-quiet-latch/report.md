# Report — bark-director-quiet-latch (#153)

## Mechanism

`barkDirector.update` on quiet open flight still called
`ensureActivityClassified` and walked every living world actor for
`classifyBarkSituation` / pass-hail even when no eligible speak, hail,
near-miss track, or pending stunt remained. The quiet latch arms after a
quiet census and short-circuits that work until membership changes,
`noteBarkWake` (spawn / combat / stunt / body-near-miss), or a 0.5 s rescan.

## Evidence

- Primary microbench (11-pair @ 60k, isolated `--expose-gc`): median **12.67×**,
  min **9.47×**, abs before **~7.76 µs/call**, dirtyWakeOk.
- Package floor (5×11-pair): medians **12.40–13.28×**, floorMin **8.311×**,
  abs before **~7.6–8.0 µs/call**, dirtyWakeOk all rounds.
- Focused suites **76/76**. Soft-GPU fps not claimed. Picture unchanged.

## Artifacts

See `artifacts/` for microbench JSON/logs, floor summary, and focused log.
