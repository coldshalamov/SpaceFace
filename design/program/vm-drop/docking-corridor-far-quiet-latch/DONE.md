# DONE — docking-corridor-far-quiet-latch

## Summary

Quiet settled flight still walked every docking-manifest station through
`corridorStateFor` + proxy publish every tick while the player was far past
the approach band (Ceres Refinery ~1260 WU from origin). Latch after a probe
shows nearest `distCenter` beyond `max(600, mouth×scale×4)`; wake on player
move (~100 WU), `entityIndex.version`, or a 0.5 s rescan. Approach / capture
/ berthed never latch. Soft-GPU fps not claimed. Picture contract ON /
unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `dockingCorridor.update` × 60k; 3 docking stations @ 1800 WU. Before =
latch OFF (walk every tick); after = latch ON. Isolated Node child processes
per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| far@1800 (5× isolated 11-pair floors) | **~17.7–18.6×** | **≥7.25×** |
| primary in-process (supporting) | ~18.2× | ≥7.90× |
| near@200 / @400 residual | ~1.00× | (no latch; no regress) |

Package floor capture (5×11-pair isolated @ 60k): medians 18.25 / 17.84 /
18.13 / 18.62 / 17.69; mins across those runs ≥7.25×. Floor across package
runs **≥7.25×** (clears ≥1.5× bar). Dirty-wake proved: move + membership →
approach engages, latch clears (`dirtyWakeOk: true`). Focused latch +
station-docking-corridor + poi-scan / still-field / far / optic / decode /
bombs / fields suites **74/74**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): registry.step residual after #136; dockingCorridor under world/sim tick.

### Focused tests

`node --test test/docking-corridor-far-quiet-latch.test.mjs test/station-docking-corridor.test.mjs test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **74/74** pass (far latch / near prevent / move wake / membership wake /
bench toggle / approach-inside-band / station corridor suite).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `4941523caf5443b254a27cf0452ba6ca3577546e`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
