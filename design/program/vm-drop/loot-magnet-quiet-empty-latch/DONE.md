# DONE — loot-magnet-quiet-empty-latch

## Summary

Quiet settled flight still paid player resolve + dual `indexedTypeScan`
for pickups/payloads every tick while both buckets were empty (no magnet
trails). Production now latches after the first empty-bucket observe and
skips until `entityIndexVersion` bumps. Soft-GPU fps not claimed. Without
a versioned entity index the latch refuses (entityList fallback stays
live). Boundary resets (`sector:enter` / `game:newGame` / `save:loaded`)
clear the latch.

## Before / after

### Offline microbench (primary — portable CPU)

Empty pickups+payloads ticks × 200k; before = player resolve + dual
indexedTypeScan every tick; after = latch skip while version clean.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-loot-magnet-empty-buckets (primary, 11 pairs) | **~3.0×** | **≥2.48×** |

Package floor capture (4×11-pair runs): medians 3.005 / 2.946 / 2.734 / 2.961;
mins 2.630 / 2.569 / 2.483 / 2.539. Floor across package runs **≥2.48×**
(clears ≥1.5× bar). Dirty-wake proved: latch quiet → version bump + pickup →
relevant resumes → re-latch after drain (`ok: true`). Soft-GPU fps not
claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
prepareFrame / loot-magnet residual on quiet settled flight after #114.

### Focused tests

`node --test test/loot-magnet-quiet-empty-latch.test.mjs
test/inactive-vfx-plan.test.mjs test/field-force-quiet-empty-latch.test.mjs
test/bomb-presentation-quiet-empty-latch.test.mjs
test/speed-lines-quiet-idle-latch.test.mjs
test/swing-trace-quiet-idle-skip.test.mjs`
→ **16/16** pass.

(Pre-existing unrelated fail in `test/tabletop-policy.test.mjs` "instance far
cull…" still red on tip without this change — not claimed here.)

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-loot-magnet-empty-buckets-3.0.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
