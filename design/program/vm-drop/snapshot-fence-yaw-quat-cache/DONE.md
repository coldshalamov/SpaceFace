# DONE — snapshot-fence-yaw-quat-cache

## Summary

`packPresentationWorldToFence` no longer runs `Math.sin/cos(halfYaw)` for every
active slot every pack. Presentation world caches half-yaw sin/cos when `rot`
is written; the fence pack reads the cache (fallback sin/cos preserved for
worlds without the columns).

## Before / after

### Offline microbench (primary — portable CPU)

400 entities × 12k packs, 30% rotating (cache refresh on those):

| | Before (sin/cos every pack) | After (cache read) |
|---|---|---|
| wall | **109.6 ms** | **39.5 ms (~2.77×)** |

Phase A cite: cpu-profile-flight `prepareFrame` ~66 ms self / pack child ~38 hits
after #13; #44 cut syncEntityViews policy — pack remained.

### Focused tests

`presentation-world` + `snapshot-fence-*` + `entity-view-sync-band` +
`ship-pitch-presentation` → **pass**.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-snapshot-fence-yaw-quat-cache.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/snapshot-fence-yaw-quat-cache-microbench.json`
- Tests: `artifacts/focused-tests.log`

## Apply order

Independent. Stacks under prepareFrame leftovers after #13+#44.

## Risks

- Zero-filled new slots use the `(yawSin,yawCos)==(0,0)` sentinel so the first
  identity write still sets `yawCos=1` before pack.
- Worlds that mutate `rot[]` without going through `writePoseScalars` will pack
  stale quats until the next pose write (production writes go through that seam).
