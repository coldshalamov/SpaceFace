# H1 row 1 — headed `check:assets:live`

**Result: PASS.** Closes the "unclaimed, neither red nor green" row.

Command, run unmodified at worktree `claude/headed-h1` off `origin/master`:

```
SF_ASSETS_LIVE_SHOT=…/authored-assets-live.jpg \
SF_ASSETS_LIVE_REPORT=…/report.json \
SF_ASSETS_LIVE_LOG=…/probe.log \
node scripts/probe-authored-assets-live.mjs
```

The harness was **not edited**. Its own env hooks wrote straight into this committed directory.

## The GPU this actually ran on

| Fact | Value |
|---|---|
| Browser | Chrome/150.0.7871.187 |
| WebGL vendor | `Google Inc. (Intel)` |
| WebGL renderer | `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)` |

This is a **real D3D11 GPU path, not SwiftShader**. That matters: a software-rendered pass would
not have exercised the pipeline-compile admission path this probe asserts on.

## Functional facts asserted (all green)

| Fact | Value |
|---|---|
| Mode reached | `flight` |
| Ships in scene | 16 |
| Ships presenting a surface | 14 |
| Presented ships that are **authored** | 14 — i.e. every visible ship |
| Non-presented ships | 2, all in `awaiting-authored-admission` (no fallback identity leaked) |
| Player asset state / mode | `authored` / `release` |
| Player authored-body proof | `ok: true` |
| Helios critical station | authored admission completed |
| Declared authored GLB parts loaded | **77 / 77**, `failureCount: 0` |
| Whole-ship GLBs loaded | **2 / 2**, `wholeShipFailureCount: 0` |
| Part root | `assets/ships/release/parts/` (default release mode) |
| Non-release part URLs on visible ships | none |
| Static batches in scene | 52 |
| Instance pools in scene | 0 |
| Admission concurrency | `maxConcurrentJobs: 1`, `maxConcurrentDecode: 1` — serial, as contracted |
| Admission memory proxy | `peakActivePlannedBytes: 0` (well under the 3 GiB ceiling) |
| Page runtime errors | none |

Residency reading: the corridor presents through **static batches (52), not instance pools (0)** on
this route. That is a functional observation for the reviewer, not a defect claim.

## NOT performance evidence

`report.json` is stamped `"informational_contended": true` at its top level. It contains many
millisecond-valued fields — `authoredDeadline.*Ms`, `authoredUpgradeDiagnostics.jobs[].durationMs`,
`partLoads[].durationMs`. **None of them is evidence.** H1 ran contended by design; matched
performance is Phase H3. The load-bearing content above is counts, booleans and states only.

## Files

- `authored-assets-live.jpg` — the live flight frame the probe photographed
- `report.json` — full probe report (timing fields flagged informational)
- `probe.log` — the probe's own PASS log
