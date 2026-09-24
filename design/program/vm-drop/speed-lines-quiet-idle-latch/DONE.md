# DONE — speed-lines-quiet-idle-latch

## Summary

Quiet settled flight still paid governed-combat resolve +
`speedLineDrive` + region + `publishVelocityLanguage` every tick with
opacity/grain already at floor and no live latch. Production now latches
after the first silent publish and skips until speed / boost /
physicsEarned wakes. Loading / photo-hide clear the latch. Soft-GPU fps
not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet feel speed-lines ticks × 200k; before = governed-combat resolve +
speedLineDrive + region + publish every tick at opacity/grain floor;
after = latch skip until cheap dirty-wake.

| | median | floor minSpeedup |
|---|---:|---:|
| speed-lines-quiet-idle-latch (primary, 11 pairs) | **~2.40×** | **≥1.75×** |

Package floor capture (4×11-pair runs): medians 2.376 / 2.557 / 2.607 /
2.401; mins 1.748 / 2.159 / 2.311 / 2.124. Floor across package runs
**≥1.748×** (clears ≥1.5× bar). Dirty-wake proof: latch quiet → speed /
boost / physicsEarned wake → update resumes (`dirtyWakeOk: true`). Soft-GPU
fps not claimed.

Phase A cite: prepareFrame / feel residual on quiet settled flight after
#111 (Picture ON; soft-GPU fps ignored).

### Focused tests

`node --test test/speed-lines-quiet-idle-latch.test.mjs test/swing-trace-quiet-idle-skip.test.mjs test/massline-release-arc.test.mjs test/massline-presentation-uvp.test.mjs test/docking-cradle-quiet-skip.test.mjs test/law-heat-telegraph-quiet-skip.test.mjs test/inactive-vfx-plan.test.mjs test/vfx-save-restore-destroy.test.mjs test/speed-line-stroke-cache.test.mjs` → **32/32** pass.

## Evidence

- Patch: `patches/0001-perf-render-quiet-latch-idle-feel-speed-lines-2.4.patch`
- Scratch: `vm-work/hillclimb-20260924j` @ `cbe7f3bd6b34e98a4a5032c9b38b7e393b8f4a79`
