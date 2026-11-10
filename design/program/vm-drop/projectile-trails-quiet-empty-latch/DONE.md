# DONE — projectile-trails-quiet-empty-latch

## Summary

Quiet settled flight still paid `indexedTypeScan(projectiles)` +
`entityIndexVersion` / ref-length cache check + `resetProjectileTrailDiag`
(7-class zero) every tick while the projectile bag was empty. Production now
latches after the first empty observe and wakes on `entityIndexVersion` or
`_projectileCacheDirty`. Soft-GPU fps not claimed. Picture contract ON /
unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet empty projectile bag × 200k; before = scan + cache check + diag reset;
after = latch (version/dirty wake only). Isolated Node child processes per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-projectile-trails-empty-relevant (primary, 13 pairs) | **~6.0×** | **≥4.95×** |

Package floor capture (4×13-pair runs @ 200k): medians 6.37 / 6.62 / 6.25 / 6.70;
mins 4.74 / 5.39 / 5.25 / 5.70. Floor across package runs **≥4.74×** (clears ≥1.5×
bar). Dirty-wake proved: empty latch → version bump + projectile → relevant →
drain → re-latch; also `_markProjectileCacheDirty` without version bump.
Focused latch 4/4. Soft-GPU fps not claimed.

Phase A cite: prepareFrame / VFX residual after #121 persistent-beams callsite.

### Focused tests

`node --test test/projectile-trails-quiet-empty-latch.test.mjs`
→ **4/4** pass (empty latch + version wake + cache-dirty wake + frame update).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-projectile-trails-empty.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 4 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
