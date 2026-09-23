# DONE — docking-corridor-publish-scratch

## Summary

`_publishProxyDiagnostics` reused `this._proxyDiagOut` / `this._proxyDiagSeen` and cached the collision-proxy template key on each station (`_sfProxyDiag*`) so settled flight stops allocating a fresh array/Set and rebuilding key strings every tick.

Focused: station-docking-corridor + collision-proxy-manifest → **40/40** pass.

## Before / after

### Offline microbench (primary — portable CPU)

12 stations × 200k publish passes (keys stable — settled stations):

| | Before | After (out/seen reuse + key cache) | Speedup |
|---|---:|---:|---:|
| wall | **709.6 ms** | **190.0 ms** | **~3.7×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `_publishProxyDiagnostics` **20.2 ms** self / 60 s settled.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-dock-reuse-proxy-diag-out-seen-station-key-cach.patch`
- Scratch: `vm-work/docking-corridor-publish-scratch` @ `8007735e1c117611c6736981f64225988b146c7a`
- Microbench: `artifacts/docking-corridor-publish-scratch-microbench.json`
- Tests: `artifacts/docking-corridor-publish-scratch-focused-tests.log`
- Measured against master `35e519ebd`

## Apply order

Independent.

## Risks

- `runtime.collisionProxies` is the retained `_proxyDiagOut` array (cleared+refilled each publish). Consumers must not retain the array across ticks expecting a frozen snapshot of membership — they already received a new array each tick before; now the array identity is stable while contents are rewritten. Frozen entry objects are unchanged.
