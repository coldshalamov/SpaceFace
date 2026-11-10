# DONE — wreck-wisps-quiet-irrelevant-latch

## Summary

Quiet settled flight still paid player resolve + `indexedTypeScan('wrecks')`
+ `Map.clear` every tick with an empty wrecks bucket (slots Map always exists
from init). Production now remembers `_wreckWispsQuietIdle` after the first
empty observe and returns until `entityIndexVersion` bumps. Type-filter makes
entityList fallback truthful; no-index refuses the latch. Soft-GPU fps not
claimed. Picture contract ON / unchanged.

Prior hold modeled a wake that still re-scanned while latched (~0.96× on the
never-created path). Version-only wake matches #115 loot-magnet and clears the
bar on the production always-created Map path.

## Before / after

### Offline microbench (primary — portable CPU)

Empty wrecks relevant × 200k; before = player + scan + Map.clear every tick;
after = latch skip after first empty observe (version-only wake).

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-wreck-wisps-empty-bucket-version-wake (primary, 11 pairs) | **~3.4×** | **≥3.01×** |

Package floor capture (4×11-pair runs): medians 3.550 / 3.645 / 3.373 / 3.358;
mins 3.201 / 2.905 / 2.870 / 3.094. Floor across package runs **≥2.87×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → version bump + wreck →
relevant resumes → re-latch after drain (`ok: true`). Soft-GPU fps not
claimed.

Phase A cite: prepareFrame / VFX residual after #116 sprites; mirrors #115
loot-magnet empty-bucket latch.

### Focused tests

`node --test test/wreck-wisps-quiet-irrelevant-latch.test.mjs
test/loot-magnet-quiet-empty-latch.test.mjs test/sprites-idle-commit-skip.test.mjs
test/field-force-quiet-empty-latch.test.mjs
test/bomb-presentation-quiet-empty-latch.test.mjs
test/vfx-save-restore-destroy.test.mjs test/inactive-vfx-plan.test.mjs`
→ **18/18** pass (17 from combined log + inactive 1/1).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-wreck-wisps-empty-bucket-3.4.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
