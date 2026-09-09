# CONTINUATION — place_lane_beacon (Helios landmark)

**Status:** SOURCE_GLB **DONE** at export bar (iter 21 reframe).

| Field | Value |
|---|---|
| **iter** | **21** (reframe_tight_spire) after campaign 1–20 |
| **weighted** | **4.79** |
| **export_bar_ok** | **true** (ok_full full-views; lit_close flaky) |
| **tris / bytes** | 8124 / 741504 |
| **dims** | ~6.1 × 30.6 × 6.1 m |
| **source** | `places/place_lane_beacon.glb` |
| **handoff** | `handoffs/2026-07-09-A-place_lane_beacon.yaml` |
| **still** | `.devshots/slice-A/landmark-beacon.png` |

## Residual
- lit_close auto-gate still fails (accent/slab edge cases) — full-view set green
- Flat AO/rough contract maps (not painted ORM atlas)
- Need release build + in-game authored proof for G8–G10

## Runtime
- Already wired: `sectorAnchors` Helios `poi_tutorial` → `landmarkGlb: place_lane_beacon`
