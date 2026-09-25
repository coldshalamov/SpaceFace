# DONE — hud-glag-transform-cache

## Summary

Optical G-lag overlays (reticle, lock ring/diamond, lead pip, target arcs) rebuilt
`translate3d(...toFixed(2)...)` every `hud.frame` tick; `setStyle` only skipped the
DOM write after the template alloc. `setLagTranslate` caches hundredths-of-a-px keys
(+ suffix/plain for rotate/bloom) so a still offset skips `toFixed` + template.

Focused HUD suite: **46/47** pass (1 failure also fails on bare master —
`HUD placement survives the normal settings save…`).

## Before / after

### Offline microbench (primary — portable CPU)

6 elements × 200 000 calls (run2):

| Path | Before | After |
|---|---|---|
| settled non-zero lag | **106.2 ms** | **8.4 ms (~12.6×)** |
| DOM/style writes | 6 | 6 (identical) |
| motion (every call changes) | 118.9 ms | 65.0 ms (~1.83×) |
| settled zero (`none`) | 7.6 ms | 11.4 ms (noise; both ≪1 µs/call) |

Primary claim is **settled-lag ~12×**. Zero path stays in the same cost class as
`setStyle(transform, 'none')` (no `toFixed` either way).

Phase A cite: cpu-profile-flight `frame @ hud.js` ~38 ms self; G-lag sites fire every frame.

### Quiet soft-GPU crucible

Not required for this DOM-string cut; primary signal is the offline microbench.
GPU tier: **software**. Owner iGPU fps not claimed. Soft-GPU: ignore fps.

## Evidence

- Patch: `patches/0001-perf-hud-quantized-early-out-for-opticalGLag-transla.patch`
- Scratch: `vm-work/hud-glag-transform-cache` @ `fe6fe56c3a2e1d3bc3a5e30a98a5c7247e12b190`
- Microbench: `artifacts/hud-glag-transform-cache-microbench.json` (+ run2)
- Tests: `artifacts/hud-glag-transform-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. `git am` clean.

## Risks

- External writers that mutate `el.style.transform` without `setLagTranslate` can
  desync `_sfLag*` until the next real change (same class as `_sfStyle`). HUD owns
  these nodes.
