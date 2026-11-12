# DONE — hud-screen-transform-cache

## Summary

`setHudScreenTransform` now caches quantized x/y/rotate/center/offset keys. A still
overlay skips rebuilding the `translate3d(...)` template every call (was string-build
then strcmp against `_sfHudTransform`).

Focused HUD suite: **60/62** pass (2 failures also fail on bare master —
`the strip renders correctly again…`, `HUD placement survives the normal settings save…`).

## Before / after

### Offline microbench (primary — portable CPU)

12 elements × 200 000 calls:

| Path | Before | After |
|---|---|---|
| settled (identical pose) | **81.2 ms** | **5.0 ms (~16.1×)** |
| DOM/style writes | 12 | 12 (identical) |
| motion (every call changes) | 82.4 ms | 94.1 ms (~60 ns/call overhead; negligible at HUD call volume) |

Phase A cite: cpu-profile-flight `frame @ hud.js` ~38 ms self; screen overlays call
`setHudScreenTransform` every frame.

### Quiet soft-GPU crucible

Not required for this DOM-string cut; primary signal is the offline microbench.
GPU tier: **software**. Owner iGPU fps not claimed. Soft-GPU: ignore fps.

## Evidence

- Patch: `patches/0001-perf-hud-quantized-early-out-for-setHudScreenTransfo.patch`
- Scratch: `vm-work/hud-screen-transform-cache` @ `792186592a5111263b5126f8fad3264c3d4c1b75`
- Microbench: `artifacts/hud-screen-transform-cache-microbench.json`
- Tests: `artifacts/hud-screen-transform-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`
