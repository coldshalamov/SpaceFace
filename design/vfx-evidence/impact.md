# Impact VFX — Elite evidence

**Hook:** `vfx.js` `_onProjectileHit` → `vfx.impact.<variant>` juice cues

## Variants (≥3)

| Variant | Trigger | Technique |
|---------|---------|-----------|
| `sparks` | Hull kinetic hit | Directional `_impactSparks` + debris particles |
| `shield_ripple` | Shield-absorbing hit | SPR_RING + SPR_FLASH + cyan spark fan |
| `hull_scorch` | Explosive/thermal hull hit | Sparks + SPR_PUFF scorch decal overlay |

## Capture frames

`.devshots/vfx-elite/impact_<variant>_{spawn,peak,decay,close,wide}.png`