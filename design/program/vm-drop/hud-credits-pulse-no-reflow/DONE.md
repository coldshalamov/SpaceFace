# DONE — hud-credits-pulse-no-reflow

## Summary

Restart the credits chip gain/spend CSS pulse without `void chip.offsetWidth` forced
sync layout. Remove classes this frame; add on the next animation frame. Picture
contract untouched; no dummy prewarm.

## Before / after

### Profile cite (ranking evidence)

Quiet settled held-thrust on master **`568d1358e`** (`probe-main-thread-profile --ms=45000`):

| | |
|---|---|
| `refreshCredits` self | **103.9 ms** |
| invocations (sample clusters) | **1** (~872–975 ms into window) |
| cause | forced sync layout to restart CSS pulse on first credit paint |

### Portable A/B (primary KPI)

8000 pulse-restart iterations; layout read = `offsetWidth` getter:

| | Legacy (`void offsetWidth`) | Modern (rAF add) |
|---|---|---|
| sync layout reads | **8000** | **0** |
| layout eliminated | — | **yes (~∞× on the layout tax)** |

Soft-GPU fps not claimed. Node wall without a real layout engine is noise.

### Focused tests

`test/hud-credits-pulse-no-reflow.test.mjs` — **4/4 pass**.

## Evidence

- Patch: `patches/0001-perf-hud-restart-credits-chip-pulse-without-forced-s.patch`
- Scratch: `vm-work/hud-credits-pulse-no-reflow` @ `b3bc6a5d5`
- Bench: `artifacts/hud-credits-pulse-no-reflow-bench.json`
- Tests: `artifacts/focused-tests.log`
- Profile: `artifacts/profile-settled-45s/report.md`
- Measured against master `568d1358e`

## Apply order

Independent. Complements HUD transform / setText caches already on master.

## Risks

- Pulse lands one frame later than the forced-reflow restart. At 60 Hz that is ~16 ms after the digit update — still reads as the same one-shot tint; no picture cut.
- Rapid chained credit events cancel the prior scheduled add via `_sfCredPulseToken` (same as restarting mid-animation before).
