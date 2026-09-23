# DONE — flight-propulsion-scratch

## Summary

1. **coolRuntime** fills a module scratch instead of `{ ...runtime }` (call sites also dropped their pre-spread).
2. **bodySnapshot** reuses `entity._flightBodyScratch` and marks `_sfNormalized`; `stepPropulsion` skips `normalizeBody`'s pos/vel copy on that path.

Focused propulsion suite: **52/52** pass (`flightV3` / vectoring / governor / arcade-draw / travel-drive / spawned-authority).

## Before / after

### Offline microbench (primary — portable CPU)

400k iterations:

| | Before | After | Speedup |
|---|---:|---:|---:|
| coolRuntime (call-site spread + inner spread) | **1322.8 ms** | **7.6 ms** | **~174×** |
| normalizeBody vs trust `_sfNormalized` | **17.1 ms** | **1.6 ms** | **~10.7×** |

Phase A cite: hitch-hillclimb-fresh-20260923 settled profile — `makeResult` 40.3 ms, `_stepCraft` 45.0 ms self, `propulsionKernel.js` ~245 ms file self.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench (alloc/CPU). GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-flight-coolRuntime-scratch-trust-normalized-bod.patch`
- Scratch: `vm-work/flight-propulsion-scratch` @ `aa6ec09ec9c15729986033dfd099165c4d44acea`
- Microbench: `artifacts/flight-propulsion-scratch-microbench.json`
- Tests: `artifacts/flight-propulsion-scratch-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/`
- Measured against master `35e519ebd`

## Apply order

Independent. Clean on bare `origin/master`.

## Risks

- Module `COOL_RUNTIME_SCRATCH` is safe because `assignPropulsionRuntime` Object.assigns immediately inside the same `_stepCraft`.
- Trusted body aliases `entity.pos`/`vel`; propulsion only reads them during the step (same as prior snapshot refs).
