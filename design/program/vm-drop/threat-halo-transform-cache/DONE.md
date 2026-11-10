# DONE — threat-halo-transform-cache

## Summary

Threat-halo `setHudTransform` rebuilt `translate3d(...toFixed(1)...)` every overlay
tick only to strcmp `_sfTransform`. Cache tenths-of-a-px keys so a still chevron
skips `toFixed` + template.

Focused suite: **7/7** pass.

## Before / after

### Offline microbench (primary — portable CPU)

8 elements × 200 000 calls (run2):

| Path | Before | After |
|---|---|---|
| settled (identical pose) | **61.0 ms** | **3.3 ms (~18.6×)** |
| DOM/style writes | 8 | 8 (identical) |
| motion (every call changes) | 65.6 ms | 48.8 ms (~1.34×) |

## Evidence

- Patch: `patches/0001-perf-threat-halo-quantized-early-out-for-setHudTrans.patch`
- Scratch: `vm-work/threat-halo-transform-cache` @ `933ac2e85fca1edaf9e90c50956ee749444369ee`
- Microbench: `artifacts/threat-halo-transform-cache-microbench.json` (+ run2)
- Tests: `artifacts/threat-halo-transform-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. `git am` clean.

## Risks

Same class as `hud-screen-transform-cache`: external transform writers can desync
quantized keys until the next real change. Halo owns these nodes.
