# Countermeasure VFX — Elite evidence

**Date:** 2026-07-06 · **Hooks:** `_onCountermeasureDeployed`, `_onTetherSnap`, `_onJumpStart`

## Variants (≥3)

| Variant | Event | Technique |
|---------|-------|-----------|
| `burst` | `countermeasure:deployed` | Chaff metallic puff / ECM fresnel shimmer ring |
| `tether_snap` | `tether:broken` | Dual-end spark burst on cable break |
| `jump_warp` | `jump:start` | Radial streak tunnel + portal ring |

## Juice cues

- `vfx.countermeasure.burst`
- `vfx.countermeasure.tether_snap`
- `vfx.countermeasure.jump_warp`

## Capture frames

`.devshots/vfx-elite/countermeasure_{burst|tether_snap|jump_warp}_*.png` (≥5 each)