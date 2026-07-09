# CONTINUATION — hull_starter

**Status:** SOURCE_GLB **DONE** at export bar (iter 28). Integrator re-release recommended.

| Field | Value |
|---|---|
| **iter** | **28** (weld_tight_frame_export) |
| **weighted** | **4.73** |
| **export_bar_ok** | **true** (sil=5, scale=5, islands=1) |
| **tris / bytes** | 9520 / 559896 |
| **dims** | ~10.9 × 1.6 × 3.1 m |
| **source** | `hulls/hull_starter.glb` |
| **stills** | `.devshots/slice-A/undock-wide.png`, `undock-close.png` |
| **handoff** | `design/graphics-sprints/handoffs/2026-07-09-A-hull_starter.yaml` |

## Residual
- lit_close_detail auto-gate still fails occasionally (accent ratio) — full-view set green
- Flat AO/rough contract maps (not painted wear atlas) — raise in later meso surfacing if store stills demand
- Re-run `build:sg04:release-assets` so release hull matches welded source

## Do not
- Island-cull without hull-body check
- Claim G10 in-game until live probe shot proves authored path
