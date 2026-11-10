# DONE — customs-cones-empty-quiet-latch

## Summary

Quiet flight still paid `lawSecurity._updateCustomsScanCones`'s full
`forEachJobInteractable` census (`customsScanConeOf` over shipLike + stations +
wrecks + payloads + pickups) every tick while no customs scanners and no
jettisoned cargo pods existed. Quiet latch short-circuits the census when both
bags stay empty; wakes on membership, a live scanner/pod, or 0.5 s rescan.
Soft-GPU fps not claimed. Picture contract ON / unchanged (no cones when empty).

Fresh subsystem outside held lifetimeSweep / classify / sync / weapons residual
clusters. Different angle from held env-machinery far, hazards far, and
sampleProjectileEvidence surface-cadence.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `lawSecurity.update` × 60k; 49 ships + 4 stations + 8 wrecks + 8 payloads
+ 12 pickups; no scanners / no jettisoned pods. Before = latch OFF; after = latch
ON. Isolated Node child processes (`--expose-gc`) per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet census (5×11-pair floors) | **~3.34–3.62×** | **≥3.03×** |

Package floor capture (5×11-pair isolated @ 60k): medians ~3.59 / 3.37 / 3.34 /
3.49 / 3.62; mins across those runs ≥3.03×. Floor across package runs **≥3.03×**
(clears ≥1.5× bar). Dirty-wake proved: customs scanner spawn + membership bump
(`dirtyWakeOk: true`). Focused latch + prior suites **42/42**. Soft-GPU fps not
claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture ON):
`lawSecurity.customsScanConeOf` / `lawSecurity.update` residual under registry.step
after #144.

### Focused tests

`node --test test/customs-cones-empty-quiet-latch.test.mjs test/weapons-npc-quiet-latch.test.mjs test/lifetime-sweep-quiet-clocks-skip.test.mjs test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/fields-idle-quiet-latch.test.mjs`
→ **42/42** pass.

Clean master `git am` verify @ `4b28a8323` → tip `f5823df5f`; focused **3/3**.

## Scratch

- Branch: `vm-work/hillclimb-20260924m`
- Tip: `f9ed89d72661de09b4b14fbde44440d8d01418c8`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
- Master am SHA: `f5823df5fcf2ad116597f360f3f89b553fffd776`
