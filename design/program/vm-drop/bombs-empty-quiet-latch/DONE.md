# DONE — bombs-empty-quiet-latch

## Summary

Quiet idle flight still paid `ensureRuntime` rack normalize + collect/sort +
empty `_tickBombs` every tick with a ready empty typed bombs bucket. Production
now quiet-latches when the bombs lane is empty and no drop/cycle/detonate edges
fire; wakes on those edges, entity-index membership, or a 0.5 s rescan. Without
a versioned bombs bucket the latch refuses (entityList fallback stays live).
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet bombs.update × 60k; 64 ships, ready empty `entityIndex.bombs`.
Before = latch OFF (normalize + collect + empty tick every tick); after = latch ON.
Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| empty-quiet-latch (primary, 11 pairs) | **~9.5–11.7×** | **≥1.78×** |

Package floor capture (primary + 5×11-pair rebenches @ 60k): medians
~9.51 / 11.15 / 10.81 / 11.67 / 10.66 / 11.35; mins across those runs
≥1.78×. Floor across package runs **≥1.78×** (clears ≥1.5× bar). Dirty-wake
proved: membership bump → latch clears / rescan arms. Focused latch + bombs
suite **28/28**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `bombs` under `registry.step` residual after #130 fields idle latch.
Prior hold "bombs-empty synthetic ~5× — not portable quiet path yet" cleared
by real `bombs.update` A/B with ensureRuntime deferred past the latch.

### Focused tests

`node --test test/bombs-empty-quiet-latch.test.mjs test/bombs.test.mjs test/inf-096-bomb-target-index.test.mjs test/bomb-rack-economy.test.mjs`
→ **28/28** pass (latch / membership wake / drop edge / live bomb refuses /
bench toggle / no-bucket refuse / bombs suite / rack economy / index targets).

## Evidence

- Patch: `patches/0001-perf-bombs-quiet-latch-empty-bombs-bay.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `83b816338`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/bombs-empty-quiet-latch-microbench.json`
- Floor: `artifacts/bombs-empty-quiet-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-bombs-empty-quiet-latch-suite.log`

## Apply order

After #130 `fields-idle-quiet-latch`. Numeric package #131.
