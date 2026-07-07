# Muzzle VFX — Elite evidence

**Date:** 2026-07-06 · **Hook:** `vfx.js` `_onFire` → `_muzzleVariant` → `_spawnMuzzle*`

## Variants (≥3)

| Variant | Weapon examples | Technique |
|---------|-----------------|-----------|
| `ballistic` | autocannon, railgun, siege lance | Warm core + forward spark cone (SPR_FLASH + particles) |
| `energy` | pulse laser, plasma (non-splash) | Cyan tight core + SPR_RING corona, fewer sparks |
| `explosive` | missile rack, torpedo | Amber SPR_RING + SPR_PUFF smoke, wide particle fan |
| `beam` | beam laser, heavy beam | Elongated dual SPR_FLASH along bore + ring at focus |

## Parameters

- Variant resolved via `resolveWeaponCueTable(weaponId, WEAPONS)` + `continuous` beam flag
- Juice cue: `vfx.muzzle.<variant>` per shot
- No Phase 1 downgrade: ballistic path preserves prior flash sizes; other classes add distinct layers

## Before / after

- **Phase 1:** single warm muzzle path for all weapons
- **Phase 2:** class-lane palette per `VFX_ELITE_STANDARD.md` technique #5

## Capture frames

Expected under `.devshots/vfx-elite/`: `muzzle_ballistic_*`, `muzzle_energy_*`, `muzzle_explosive_*`, `muzzle_beam_*` (≥5 each: spawn, peak, decay, close, wide)