# DONE — weapon-presenter-composite-quiet-latch

## Summary

Quiet settled flight still paid ageShieldContacts + a11y + setCamera/depth +
empty syncBolts + nearMiss cadence + N pool.update calls every tick even after
per-pool early-outs (#89–#102, #120). Production now latches after the first
all-quiet observe and wakes on pool live / quarks._quietEmpty / shields /
fields.active / entityIndexVersion / projectiles. Soft-GPU fps not claimed.
Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet weapon-presenter composite residual × 80k; before = latch forced off
each tick (full residual); after = composite latch. Isolated Node child
processes per mode. Real `WeaponVfxPresenter`.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-weapon-presenter-composite (primary, 13 pairs) | **~6.11×** | **≥5.35×** |

Package floor capture (5×13-pair runs @ 80k): medians 6.109 / 6.114 / 6.391 /
6.067 / 5.945; mins 5.354 / 5.125 / 4.769 / 5.08 / 5.198. Floor across package
runs **≥4.769×** (clears ≥1.5× bar). Dirty-wake proved: quarks.spawn /
addShieldContact / fields.active push / entityIndexVersion / projectiles.
Focused latch+well+weapon-vfx 26/26. Soft-GPU fps not claimed.

Phase A cite: prepareFrame / weapon-presenter residual after #125
pending-detonations; prior O1 multi-pool thin probe ~1.15× held — this ships
the full-residual composite angle.

### Focused tests

`node --test test/weapon-presenter-composite-quiet-latch.test.mjs test/well-distortion-quiet-empty-latch.test.mjs test/weapon-vfx-techniques.test.mjs`
→ **26/26** pass (composite latch + quarks/shield/well/index/projectile wakes + well latch + weapon-vfx techniques).

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-weapon-presenter-composite-residual.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ see `scratch-sha.txt`
- Microbench + 5 package rebench floors in `artifacts/`
- Focused logs in `artifacts/`
