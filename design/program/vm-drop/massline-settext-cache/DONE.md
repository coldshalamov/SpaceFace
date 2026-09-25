# DONE — massline-settext-cache

## Summary

Massline HUD `setText` JS last-write cache (`el._sfText`), same pattern as `hud-settext-cache` / `setStyle`. Acquisition preview + cue/throw/self labels skip DOM text reads when unchanged.

Focused: HUD suite **33/33** + massline acquisition/presentation/orbit/input **69/69** (combined logs).

## Before / after

### Offline microbench (primary)

500k settled-label ticks (getter counts reads):

| | textContent compare | `_sfText` cache |
|---|---:|---:|
| wall | 17.1 ms | 15.9 ms (~1.08× synthetic) |
| DOM text reads | 500000 | **0** |

Phase A cite: hitch-hillclimb-fresh `src/ui/masslineHud.js` 77.4 ms file self; mirrors proven hud-settext-cache (~1.40× with real DOM).

### Quiet soft-GPU crucible

Not required for this DOM-read cut. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-massline-cache-setText-last-write-skip-textConte.patch`
- Scratch: `vm-work/massline-settext-cache` @ `c0718f8816f03e96104b605878a074af90b6b687`
- Microbench: `artifacts/massline-settext-cache-microbench.json`
- Tests: `artifacts/massline-settext-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements `hud-settext-cache` (also vm-drop only).

## Risks

- External writers that mutate `textContent` without `setText` can desync until the next real change (same class as hud `_sfStyle` / `_sfText`).
