# Mining VFX — Elite evidence

**Date:** 2026-07-06 · **Hooks:** `_onMiningStart`, `_onMiningTick`, `_updateSeamMarkers`

## Variants (≥3)

| Variant | Event | Technique |
|---------|-------|-----------|
| `beam` | `mining:start` | Additive ribbon quad + glow layer, ore-tinted pulse |
| `ore_chunk` | `mining:tick` | Contact flash + fan sparks + drifting dust puff |
| `seam_marker` | asteroid `data.seams` | Instanced ember markers (scanner-hot when lit) |

## Juice cues

- `vfx.mining.beam`
- `vfx.mining.ore_chunk`
- `vfx.mining.seam_marker`

## Capture frames

`.devshots/vfx-elite/mining_{beam|ore_chunk|seam_marker}_*.png` (≥5 each)