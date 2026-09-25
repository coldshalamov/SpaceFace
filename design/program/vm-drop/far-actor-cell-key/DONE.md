# DONE — far-actor-cell-key

## Summary

Integer-packed far-actor grid keys (mirror asteroidField). Focused tests **28/28**
pass (`far-actor-cell-key` + `far-actors` + `decode-runway-residency`).

## Before / after

### Offline microbench (primary — portable CPU)

| | Before (string `0:0`) | After (number) |
|---|---|---|
| 8k queries × 400 rows × ~4700 WU disc | **271.1 ms** | **123.2 ms (~2.2×)** |
| grid key type | string | number |

### Quiet soft-GPU crucible seed 4242 (secondary, `SPACEFACE_SMOOTH_MS=20000`)

| Metric | After (scratch) | Notes |
|---|---|---|
| worst frame | 1000 ms | soft-GPU noise — primary is microbench |
| p99 | 333 ms | |
| hitch callbacks | 56 / 193 | |
| game speed | 45.7 % | |
| typical sim | 9.3 ms | |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-world-pack-far-actor-grid-keys-as-integers.patch`
- Scratch: `vm-work/far-actor-cell-key` @ `070c583940eb306fe03de0f4350e93a4b92c3309`
- Microbench: `artifacts/far-actor-cell-key-bench-{before,after}.json`
- Tests: `artifacts/far-actor-cell-key-focused-tests.log`
- Crucible after: `artifacts/far-actor-cell-key-after-crucible.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements hitch-asteroid-cell-key (already on master).

## Risks

- Save/schema does not persist the grid (rebuilt from rows); in-tab string→number
  migrate covers a hot-reload edge only.
- JS packing uses multiply (not `<<`) so keys stay outside 32-bit bitwise truncate.
