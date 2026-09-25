# DONE — sprites-idle-commit-skip

## Summary

Quiet settled flight still paid `resetInstancedSpriteBuckets` +
`commitInstancedSpriteBuckets` (4 buckets × 7 dynamic-buffer bindings) every
tick while `liveSpriteCount===0` (mesh.count already 0 after the first idle
publish). Production now remembers `_spritesPublishedIdle` after the first
quiet reset+commit(0) and returns until `_activateSprite` clears the flag.
Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Empty sprite integrate × 200k; before = 4× assert + 4× commit every tick;
after = latch skip after first idle publish.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-sprites-idle-commit-skip (primary, 11 pairs) | **~6.4×** | **≥5.89×** |

Package floor capture (4×11-pair runs): medians 6.893 / 6.705 / 6.731 / 6.630;
mins 5.930 / 6.082 / 5.891 / 5.972. Floor across package runs **≥5.89×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → activate sprite →
integrate resumes → re-latch after drain (`ok: true`). Soft-GPU fps not
claimed.

Phase A cite: prepareFrame / VFX residual after #115 loot-magnet; mirrors
shipped #92 particles-idle-commit-skip on the 4-bucket sprite path.

### Focused tests

`node --test test/sprites-idle-commit-skip.test.mjs
test/vfx-instanced-sprite-pool.test.mjs test/vfx-structured-transients.test.mjs
test/vfx-save-restore-destroy.test.mjs`
→ **16/16** pass.

## Evidence

- Patch: `patches/0001-perf-render-skip-idle-sprite-bucket-commit-when-live-0-6.4.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
