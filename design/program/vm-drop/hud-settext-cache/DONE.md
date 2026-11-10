# DONE — hud-settext-cache

## Summary

`setText` now keeps a JS-side last-written cache (`el._sfText`), same pattern as
`setStyle`. Settled `hud.frame` was re-reading `el.textContent` on every call
(DOM text walk / possible layout flush) even when the label was unchanged.

Focused HUD suite: **48/50** pass (2 failures also fail on bare master —
`the strip renders correctly again…`, `HUD placement survives the normal settings save…`).

## Before / after

### Offline microbench (primary — portable CPU)

48 elements × 20k ticks, change every 200 ticks:

| | textContent compare | `_sfText` cache |
|---|---|---|
| wall | **36.5 ms** | **26.2 ms (~1.40×)** |
| DOM text reads | 960000 | **0** |
| DOM writes | 9600 | 9600 (identical) |

Phase A cite: cpu-profile-flight `frame @ hud.js` ~38.2 ms self / 60 s settled.

### Quiet soft-GPU crucible

Not required for this DOM-read cut; primary signal is the offline microbench.
GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-hud-cache-setText-last-write-skip-textContent-r.patch`
- Scratch: `vm-work/hud-settext-cache` @ `941643eb8303a9033c92395817a8fe51f6b47d84`
- Microbench: `artifacts/hud-settext-cache-microbench.json`
- Tests: `artifacts/hud-settext-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`
- Measured against master `35e519ebd`

## Apply order

Independent. `git am` clean.

## Risks

- External writers that mutate `el.textContent` without `setText` can desync the
  cache until the next real change through `setText` (same class of risk as
  `setStyle` / `_sfStyle`). HUD owns these nodes.
