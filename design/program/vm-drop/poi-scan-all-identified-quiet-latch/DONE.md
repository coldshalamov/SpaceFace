# DONE — poi-scan-all-identified-quiet-latch

## Summary

Fully-identified (or no proximity-scannable) sectors still paid `_tickPOIScan`'s
carrier + discovery walk every tick. Latch after a probe finds zero proximity
work; wake on `sectorId`, `pois.length`, or a 0.5 s rescan (covers newly
admitted / `signal:investigated` POIs). **Identify path preserved when work
remains.** Soft-GPU fps not claimed. Picture contract ON / unchanged.

Absolute cost is small (~0.5 µs/call at 24 POIs before; Ceres-scale ~4 POIs
still ~7× in-process) — shipped because portable floor clears ≥1.5× as the
digest optional next allowed.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `_tickPOIScan` × 60k; 24 all-identified POIs. Before = latch OFF (walk
every tick); after = latch ON. Isolated Node child processes per package
rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| all-identified (5× isolated 11-pair floors) | **~3.9–4.2×** | **≥3.26×** |
| primary in-process (supporting) | ~15.1× | ≥3.76× |
| Ceres-scale 4 POIs (in-process) | ~7.4× | ≥4.09× |
| one-unidentified residual | ~1.01× | (no skip; no regress) |

Package floor capture (5×11-pair isolated @ 60k): medians ~4.21 / 4.06 / 3.92 /
4.11 / 4.02; mins across those runs ≥3.26×. Floor across package runs **≥3.26×**
(clears ≥1.5× bar). Dirty-wake proved: sectorId / pois.length. Focused latch +
asteroid-field / far / optic / decode / bombs / fields suites **62/62**. Soft-GPU
fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): world.update / `_tickPOIScan` under registry.step residual after #135.

### Focused tests

`node --test test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/asteroid-field.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/far-actors.test.mjs test/far-shelf-promotion.test.mjs`
→ **62/62** pass (latch / length wake / sector wake / identify preserved /
bench toggle).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `348695004dfb3d778e0b704c8a066ddda0db2cf2`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
