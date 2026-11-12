# DONE — micromotion-settled-skip

## Summary

Quiet parked craft still ran full RCS resolve, gimbal, bell thermal, haul/yield,
and spring integration every `updateCraftMicroMotion` closure tick. Zero-G idle
breath is the only readable cosmetic on a settled hull.

Production now takes a **settled fast-path** when springs/heat/tether/boost/crit
are quiet and speed &lt; 12: keep idle breath (absolute bank/pitch write), clear
RCS firings, still run turret idle sweep + drill. Observed-motion RCS stays on
when `angVel` or yaw changes (no actuator block). Bench-only
`setCraftMicroMotionSettledSkipForBench(false)` restores always-full for A/B.

## Before / after

### Offline microbench (primary — portable CPU)

80 parked ships × 4k frames; before = full path (bench toggle off); after =
settled fast-path.

| | Before | After | |
|---|---:|---:|---|
| wall (last run) | 168 ms | 94 ms | **~1.78×** |
| median of 5 | — | — | **~1.81×** |
| min of 5 | — | — | **~1.70×** |
| idle breath | alive | alive | heave/roll match |

Primary: **~1.81×** (median). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924t`
(Picture ON): idle **57.9%**, long tasks **15**; `syncEntityViews` →
`updateCraftMicroMotion` under prepareFrame residual after #13+#44+#46+#47+#51–#56.

### Focused tests

`ship-micro-motion` + `advanced-micro-motion` + `ship-locomotion-presentation` +
`ship-pitch-presentation` + `entity-view-sync-band` → **35/35** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-settled-craft-micromotion-fast-path.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/micromotion-settled-skip-microbench.json`
- Tests: `artifacts/focused-tests-micromotion-settled-skip.log`

## Apply order

Independent. Prefer after #56. Stacks under prepareFrame / syncEntityViews /
updateCraftMicroMotion residual.

## Risks

- Settled gate must miss any live spring/heat/tether/boost/crit/`angVel` signal;
  a future cosmetic that mutates hull without those flags would stay frozen until
  the craft leaves settled (none today).
- Absolute bank/pitch write on the fast-path assumes `entity.bank`/`pitch` are the
  pose bases (ship-pitch presentation owns them).
- Bench-only `setCraftMicroMotionSettledSkipForBench` must stay default-on in prod.
