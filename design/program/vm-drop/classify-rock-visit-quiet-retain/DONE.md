# DONE — classify-rock-visit-quiet-retain

## Summary

Quiet parked Ceres still re-ran classifyActivity + applyStamp + signature for
every near-disc asteroid/payload every tick after #64 rock-body context and
held resolvePins/visit cuts (~1.09×). Production now retains after the first
parked observe when extents + pinFacts + quantized pose are stable, and wakes
on player speed / origin / extents / pinFacts revision / pose / scheduled wake /
pending grace / first observation. Soft-GPU fps not claimed. Picture contract
ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet classifyWorld rock-visit retain × 8k; before = player vel keeps retain
disarmed (full rock visit); after = parked retain armed. Isolated Node child
processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-rock-visit-retain (primary, 11 pairs) | **~3.39×** | **≥2.36×** |

Package floor capture (5×11-pair runs @ 8k): medians ~3.36–3.50; mins
~2.15–2.87. Floor across package runs **≥2.155×** (clears ≥1.5× bar). Dirty-wake
proved: rock pose / player speed / mining pinFacts. Focused activity + retain
39/39. Soft-GPU fps not claimed.

Phase A cite: classifyWorld residual after #37+#38+#45+#48+#60+#62+#64;
held rock-resolvePins / rock visit ~1.09× — this ships the full-visit retain
angle.

### Focused tests

`node --test test/classify-rock-visit-quiet-retain.test.mjs test/activity-runtime.test.mjs test/activity-classification.test.mjs`
→ **39/39** pass (retain republish + pose/speed/mining wakes + grace demotion
regression + prior activity runtime/classification).

## Evidence

- Patch: `patches/0001-perf-activity-quiet-retain-parked-rock-classify-visits.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 5 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
