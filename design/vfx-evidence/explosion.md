# Explosion VFX — Elite evidence

**Date:** 2026-07-06 · **Hooks:** `_explodeSmall`, `_explode`, `_explodeCapital`

## Variants (≥3)

| Variant | Trigger | Technique |
|---------|---------|-----------|
| `small` | `entity:killed` (fighter) | Interior flash + 2-stage sparks + 260ms shockwave ring |
| `medium` | `entity:destroyed` (asteroid/wreck) | Multi-layer flash + triple chromatic shockwave + ember/debris fan |
| `capital` | `entity:killed` (capital) | 3 sequential internal flashes over 800ms + core bloom + debris fan |

## Juice cues

- `vfx.explosion.small`
- `vfx.explosion.medium`
- `vfx.explosion.capital`

## Before / after

- **Phase 1:** single `_explode` path for most kills
- **Phase 2:** scale ladder per `VFX_ELITE_STANDARD.md` technique #8; capital gets fourth outer pressure wave

## Capture frames

`.devshots/vfx-elite/explosion_{small|medium|capital}_*.png` (≥5 each)