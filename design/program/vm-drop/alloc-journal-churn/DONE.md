# DONE — alloc-journal-churn

## Summary

Cross-tick coalesce for retained presentation journal transform/visual records.
Focused tests **12/12**. Primary signal: offline microbench + crucible hitch/worst.

## Before / after

### Offline microbench (64 entities × 120 moving ticks)

| | Before (drain-each-tick = no retained coalesce) | After (cross-tick coalesce) |
|---|---|---|
| transformCount | **7680** | **64** |
| transformCoalesceCount | 0 | **7616** |
| writeSequence | 7744 | **128** |
| pending retained | 0 (drained) | **128** (spawns+transforms) |

### Quiet soft-GPU crucible seed 4242

| Metric | Before (master `59df2a08ed9684e947f79d88e1d41f5c59acbee0`) | After (scratch) | Notes |
|---|---|---|---|
| worst frame | 783 ms | **267 ms** | **win** |
| hitch callbacks | 65 / 342 | **31 / 365** | **win** |
| game speed | 56.9 % | **69.5 %** | **win** |
| p95 / p99 | 133.3 / 183.4 ms | **116.7 / 166.7 ms** | win |
| launch to flight | 13.1 s | 11.9 s | mild (opening path untouched) |
| fps mean | ignore | ignore | soft-GPU |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-presentation-coalesce-retained-transform-visual.patch`
- Scratch: `vm-work/alloc-journal-churn` (see `scratch-sha.txt`)
- Phase A cite: alloc-profile-flight `append @ presentationJournal.js`

## Risks

- Consumers that required intermediate per-tick transforms inside one undrained
  window now see only the latest pose/visual (prev/current scalars still come from
  the entity at publish time). Matches presentation's latest-wins consume model.
- Visual cross-tick coalesce shares the same policy; spawn/destroy never coalesce.
