# VFX Elite Standard (Phase 2)

**Authority:** `design/spec2/00_MASTER_TASTE.md` → `SPEC3-F9-elite-finish-bar.md` → this doc.

Research ritual completed 2026-07-06. Reference frames (research only): `.devshots/vfx-references/`.

## Adopted techniques (≥8)

| # | Technique | Application in SpaceFace | Reference |
|---|-----------|-------------------------|-----------|
| 1 | **Additive sprite punch + radial falloff** — core flash scales 1.2→2.4× in 2–4 frames, opacity ease-out | Muzzle `SPR_FLASH`, impact cores | [Muzzle flash breakdown](https://www.youtube.com/watch?v=tTThZxgtVGs) (~2:10 layered alpha) |
| 2 | **Shockwave ring mesh** — expanding `SPR_RING` with thickness fade, not solid disk | Small/medium explosions, shield ripple | [Stylized explosion shader](https://www.youtube.com/watch?v=__y100uwVdM) (~4:30 ring pass) |
| 3 | **UV-scroll thruster plume** — noise texture scroll on billboard + color ramp by lifetime | Engine trails, boost cones | [Sci-fi engine thrust shader](https://gameidea.org/2024/08/22/sci-fi-engine-thrust-shader/) |
| 4 | **Soft particle puff + drag** — `SPR_PUFF` with velocity inheritance and gravity bias | Explosion debris, mining ore chunks | [Godot stylized explosion VFX](https://gameidea.org/assets/godot-explosion-vfx-stylized/) |
| 5 | **Weapon-class palette lanes** — ballistic warm, energy cyan, explosive amber, beam white-core | Muzzle + projectile + tracer variants | [Realtime VFX muzzle thread](https://realtimevfx.com/t/wondering-how-good-muzzle-flashes-are-made/13540) |
| 6 | **Faction tint multiply** — secondary hue on trail streak material without rebaking sprites | Concord/Reaver/Meridian projectile variants | [Projectile tutorial](https://www.youtube.com/watch?v=jLEjXFrLnmg) (~6:00 color lanes) |
| 7 | **Impact decal scorch alpha** — brief albedo/roughness spike on hull hit (presentation cue) | Hull scorch decals, shield ripple overlap | [Impact decal PBR](https://www.youtube.com/watch?v=IABJTK-C3Ww) (~3:45 decal fade) |
| 8 | **Scale ladder explosions** — small puff / medium ring+particles / capital multi-ring + light pool | `_explodeSmall`, `_explode`, `_explodeCapital` | [Explosion scale ladder](https://realtimevfx.com/tag/explosion) |
| 9 | **Mining beam volumetric ribbon** — `createMasslineRibbonMaterial` + ore chunk burst on tick | Mining beam + yield particles | [Beam VFX](https://www.youtube.com/watch?v=_RXpdf-E_fo) (~1:20 ribbon) |
| 10 | **Station emissive strobe cadence** — sin-modulated emissive on nav/dock lights, not full mesh flash | Place ambient emissives | [Nav light cadence](https://www.youtube.com/watch?v=YuCvAwZ3OlQ) (~0:45 strobe) |

## Effect families — variation contract

Each family: **≥3 named variants**, **≥5 capture frames** per variant in `.devshots/vfx-elite/`, evidence in `design/vfx-evidence/<family>.md`.

| Family | Variants (minimum) | Implementation hook |
|--------|-------------------|---------------------|
| muzzle | ballistic, energy, explosive (+ beam) | `vfx.js` `_onFire` |
| projectile | small, medium, faction_tint | combat projectile trail |
| impact | sparks, shield_ripple, hull_scorch | `_impactSparks`, `_onDamage` |
| explosion | small, medium, capital | `_explodeSmall`, `_explode`, `_explodeCapital` |
| thruster | cruise, boost, damage | `_emitEngineTrail`, `_onBoost` |
| mining | beam, ore_chunk, seam_marker | mining beam + tick |
| countermeasure | burst, tether_snap, jump_warp | countermeasure + tether + jump |
| station_emissive | dock, nav_strobe, hazard | presentation / place cues |

## Determinism

VFX layer is cosmetic — `Math.random()` allowed in `vfx.js` only. Sim systems must not branch on VFX randomness.

## Quality bar

No silent downgrade of Phase 1 effects. New variants add to pools; caps follow `particleQuality` settings in `vfx.js`.