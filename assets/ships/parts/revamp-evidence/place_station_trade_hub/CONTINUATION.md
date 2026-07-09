# CONTINUATION — place_station_trade_hub

**Status:** SOURCE_GLB **DONE** at art floor (G1–G7). Integrator G8–G10 still open.

| Field | Value |
|---|---|
| **iter** | **20/20** (life polish) |
| **weighted** | **4.9** |
| **export_bar_ok** | **true** (sil=5, scale=5) |
| **tris / bytes** | 21372 / 1,835,976 |
| **source** | `places/place_station_trade_hub.glb` |
| **blend** | `blender/place_station_trade_hub_authored.blend` |
| **finalize** | `finalize.log` 2026-07-09 |
| **handoff** | `design/graphics-sprints/handoffs/2026-07-09-A-place_station_trade_hub.yaml` |
| **stills** | `.devshots/slice-A/station-approach.png` (+ close) |

## Residual (non-blocking for handoff)
- lit_close_detail auto-frame often reports `ok:false` border_ratio — human still readable
- Deficiency list in late iters reused template strings; visual density from campaign geometry is real
- Need **release build** + in-game station approach still for G8–G10

## Integrator next
1. `npm run build:sg04:release-assets`
2. `npm run check:asset-reachability` + station load checks
3. In-game authored screenshot (not procedural)

## Slice A — do NOT restart this asset
Next highest incomplete ranks after hub packaging:
1. **hull_starter** — iters 25 but export_bar_ok **false** (scale_truth 4≠5); dark materials / release
2. **landmark_beacon_spire** (or sector monument) — missing manifest row
3. **place_gate_jump_ring** + gate VFX
4. Helios sky kit / asteroids / chase camera
5. engine_vector — 20 iters logged but deficiencies still “flat face / slab”; quality re-audit
