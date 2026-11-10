# DONE — well-distortion-quiet-empty-latch

## Summary

Quiet settled flight still paid `resolveVfxAccessibilityProfile` + CAP-6 slot zero +
`DistortionField.update` (unconditional uTime write before live early-out) every tick
with an empty `fields.active` bag. Production now remembers `_wellDistortionQuietEmpty`
after the first empty sync and returns until `fields.active` ref/length changes.
Latch only when `activeLen === 0` so reduced-motion + live wells keep syncing.
Missing/replaced active wakes. Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Empty fields.active sync × 400k; before = a11y + CAP zero + DistortionField.update
(uTime + live early-out); after = latch skip after first empty sync (active ref/len wake).
Isolated Node child processes per mode.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-well-distortion-empty-active-a11y-utime (primary, 13 pairs) | **~2.16×** | **≥1.63×** |

Package floor capture (4×13-pair runs @ 400k): medians 2.04 / 2.08 / 2.11 / 2.16;
mins 1.63 / 1.87 / 1.64 / 1.64. Floor across package runs **≥1.63×** (clears ≥1.5×
bar). Dirty-wake proved: latch quiet → active.push(well) → sync resumes → re-latch
after drain; active ref replace wakes (`ok: true`). Soft-GPU fps not claimed.

Phase A cite: prepareFrame / WeaponVfxPresenter residual after #119 npc-job-signatures;
**different angle** from held well-distortion quiet sync empty ~1.47× / floor ~1.18×
(prior probe omitted DistortionField uTime write + real a11y resolve).

### Focused tests

`node --test test/well-distortion-quiet-empty-latch.test.mjs
test/vfx-well-distortion.test.mjs test/weapon-vfx-techniques.test.mjs
test/impact-event-grammar.test.mjs`
→ **50/50** pass (latch dirty-wake 4/4 + well/weapon/impact suite).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-well-distortion-empty-s.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 4 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
