# Thruster VFX — Elite evidence

**Date:** 2026-07-06 · **Hooks:** `_emitEngineTrail`, `_onBoost`, `_emitDamageSmoke`

## Variants (≥3)

| Variant | Read | Technique |
|---------|------|-----------|
| `cruise` | `cruise:engaged` + high throttle | Cyan spear plume, elongated streak meshes |
| `boost` | `ship:boostStart` | White-hot nozzle kick + wide particle fan |
| `damage` | hull < 40% + thrust | Grey smoke puffs + critical orange embers |

## Juice cues

- `vfx.thruster.cruise`
- `vfx.thruster.boost`
- `vfx.thruster.damage`

## Capture frames

`.devshots/vfx-elite/thruster_{cruise|boost|damage}_*.png` (≥5 each)