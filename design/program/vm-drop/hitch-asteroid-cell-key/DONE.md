# DONE — hitch-asteroid-cell-key

## Summary

Integer-packed asteroid field grid keys. Focused tests **12/12** pass
(`asteroid-field-cell-key` + `asteroid-field`).

## Before / after

### Offline microbench (primary signal — portable CPU)

| | Before | After |
|---|---|---|
| 20k queries × 800 rocks | **111.6 ms** | **84.0 ms (~25%)** |
| grid key type | string (`-5:-5`) | number |

### Quiet soft-GPU crucible seed 4242 (secondary)

| Metric | Before (master) | After | Notes |
|---|---|---|---|
| worst frame | 1250 ms | **1083 ms** | win |
| p99 | 333.3 ms | **183.4 ms** | win |
| game speed | 40.2 % | **48.7 %** | mild win (noise vs hitch-shed-floor) |
| hitch callbacks | 232/347 | 227/368 | flat — expected; this is not the hitch classifier |
| typical sim | 7.1 ms | 8.0 ms | soft-GPU noise |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-world-pack-asteroid-field-grid-keys-as-integers.patch`
- Scratch: `vm-work/hitch-asteroid-cell-key` @ `5f84208e3f24e2fec911a1cb0849019cef525a76`
- Phase A cite: cpu-profile-flight `queryAsteroidField` 285 ms self

## Risks

- Save/schema does not persist the grid (rebuilt from rocks); in-tab string→number
  migrate covers a hot-reload edge only.
- JS packing uses multiply (not `<<`) so keys stay outside 32-bit bitwise truncate.
