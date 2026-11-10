# DONE — plasma-stream-cold-reset-skip

## Summary

Quiet plasmaStream residual under prepareFrame / `_updateEnergy` after #93:
already-cold `!commanded` ticks still paid `integrateDriveEnvelope`, boost
blend, socket setup, `_trailLiveCount()` walk, then `reset()` (throats, ribbons,
trails, env, group.visible) every frame. After the first cold gate, the system
was already dark — repeated reset was pure CPU with no picture effect.

Production early-outs when nothing is commanded and the stream is already fully
cold (`!_active && !sampler.hasLive && !group.visible`). The existing cold gate
still calls `reset()` once when first going dark.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet cold update × 200k × 11 isolated
pairs. Before = envelope+reset every tick; after = already-cold early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-plasma-already-cold-update (primary, 11 isolated pairs) | **~3.3×** | **≥2.81×** |

Primary: **~3.3×** median (floor minSpeedup ≥2.81× across rebenches). Soft-GPU
fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
plasmaStream under prepareFrame/energy on quiet settled flight (parked /
coast-dark moments).

### Focused tests

`plasma-stream-thruster` + `thruster-history-contract` +
`thruster-propulsion-vocabulary` + `contrail-corkscrew` +
`retro-thruster-integration` → **62/62** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-skip-plasmaStream-cold-reset-already-dark-3.3x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/plasma-stream-cold-reset-skip-microbench.json`
- Tests: `artifacts/focused-tests-plasma-stream-cold-reset-skip.log`

## Apply order

Independent of #93. Stacks under prepareFrame / energy / plasmaStream residual.
Clean on stacked tip through #92 (+#93). Prefer apply after #93 for digest order.

## Risks

- Gate keys on raw command (throttle/drive/boost), `_active`, `sampler.hasLive`,
  and `group.visible` (set false by `reset()`). Spool-up from cold still enters
  the full path when commanded; first darkening still resets once via the
  existing cold gate.
