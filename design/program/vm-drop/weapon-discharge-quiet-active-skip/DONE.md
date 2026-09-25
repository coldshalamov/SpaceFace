# DONE — weapon-discharge-quiet-active-skip

## Summary

Quiet weapon-discharge residual under prepareFrame / WeaponVfxPresenter after
#92: `discharges.update` always walked CAP (48) slots and paid
`SweptSurfaceBatch.begin` (assert + dirty.fill) + `end`/`commitDynamicBufferOwner(0)`
every frame when no source/impact surfaces were alive. Mesh was already
count=0/visible=false after the frame that retired the last slot.

Production tracks `activeCount` (spawn/spawnImpact ++ when taking a dead slot;
age/pose retire --; dispose clear) and returns immediately when zero.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. Modeled quiet CAP=48 walk + begin/end × 200k
updates × 11 isolated pairs. Before = walk+commit every tick; after =
activeCount===0 early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-discharge-active-zero-update (primary, 11 isolated pairs) | **~6.7×** | **≥4.86×** |

Primary: **~6.7×** median (floor minSpeedup ≥4.86× across rebenches). Soft-GPU
fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
weapon presenter / force-language under prepareFrame on quiet settled flight.

### Focused tests

`weapon-source-identity` + `vfx-force-language` + `muzzle-structural-vfx` +
`wave-a7-muzzle-flow` → **36/36** pass.

Pre-existing unrelated: `inf-006-014` INF-009 muzzle-flow clock asserts (2 fail
with or without this patch; harness uses `Object.create` + `_strip` only).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-WeaponDischargePool-activeCount-0-6.7x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/weapon-discharge-quiet-active-skip-microbench.json`
- Tests: `artifacts/focused-tests-weapon-discharge-quiet-active-skip.log`

## Apply order

Independent of #90–#92. Stacks under prepareFrame / weapon presenter residual.
Clean on stacked tip through #92. Prefer apply after #92 for digest order.

## Risks

- Relies on `activeCount` staying in sync: coalesce into already-alive source
  does not ++ (correct); displace of live lower-priority keeps count; pose-miss
  and age retire both --. dispose zeroes.
