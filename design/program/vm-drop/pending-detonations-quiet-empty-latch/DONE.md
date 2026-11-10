# DONE — pending-detonations-quiet-empty-latch

## Summary

Quiet settled flight still walked all 12 pending-detonation slots every tick
while none were active. Production now latches after the first empty observe
and wakes on `_scheduleDetonation` (dirty publish; reset also clears for
re-observe). Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet empty pending-detonations 12-slot walk × 400k; before = unlatched walk;
after = schedule-wake latch. Isolated Node child processes per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-pending-detonations-empty (primary, 13 pairs) | **~2.75×** | **≥2.22×** |

Package floor capture (5×13-pair runs @ 400k): medians 2.647 / 2.763 /
2.728 / 2.806 / 2.752; mins 2.224 / 1.939 / 2.219 / 1.769 / 2.526. Floor
across package runs **≥1.769×** (clears ≥1.5× bar). Dirty-wake proved:
`_scheduleDetonation` clears latch. Focused latch+gas+phased-explosion
14/14. Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #124 gas-quiet-empty.

### Focused tests

`node --test test/pending-detonations-quiet-empty-latch.test.mjs test/gas-quiet-empty-latch.test.mjs test/phased-explosion-lifecycle.test.mjs`
→ **14/14** pass (empty latch + schedule wake + drain re-latch + reset re-observe + gas + phased explosion).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-pending-detonations-empty-walk.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 5 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
