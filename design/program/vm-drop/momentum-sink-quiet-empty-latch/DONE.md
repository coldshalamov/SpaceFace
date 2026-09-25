# DONE — momentum-sink-quiet-empty-latch

## Summary

Quiet settled flight still paid `combat.entities` for-in + MOMENTUM_SINK status
probes every 12 Hz cadence with an empty sink bag. Production now remembers
`_momentumSinkQuietEmpty` after the first empty collect and returns until
`statusNextPendingSeq` bumps. Missing seq refuses the latch. Soft-GPU fps not
claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Empty MOMENTUM_SINK bag collect × 200k over 48 combat entity rows; before =
for-in + status probe every cadence; after = latch skip after first empty
collect (statusNextPendingSeq wake).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-momentum-sink-empty-combat-walk (primary, 11 pairs) | **~137×** | **≥101×** |

Package floor capture (4×11-pair runs): medians 131.7 / 137.8 / 136.2 / 140.1;
mins 120.1 / 117.7 / 111.2 / 102.0. Floor across package runs **≥101.99×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → seq bump + live sink →
emit resumes → re-latch after drain (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #117 wreck-wisps; mirrors #106
status-attached seq wake.

### Focused tests

`node --test test/momentum-sink-quiet-empty-latch.test.mjs
test/momentum-sink-presentation.test.mjs test/loot-magnet-quiet-empty-latch.test.mjs
test/wreck-wisps-quiet-irrelevant-latch.test.mjs test/sprites-idle-commit-skip.test.mjs
test/field-force-quiet-empty-latch.test.mjs test/inactive-vfx-plan.test.mjs`
→ **26/26** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-momentum-sink-empty-com.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
