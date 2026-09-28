# SpaceFace color + lighting standard — v1 (2026-09-27)

Active color/lighting calibration for the live renderer. Companion to
`ILLUSTRATED_GRAPHICS_STANDARD.md` (art direction), `FORGE.md` (authored bodies),
`sectorVisualProfiles.js` (per-sector rig), `bloom.js` (post), and the field/VFX
readability bibles. This file names numbers, not taste.

## 1. Rendering intent

Space is dark; ships are working hardware under one hard sun plus planet bounce.
Every lit frame answers three questions: where is the sun, which side is shadow,
and what just flashed. Nothing else earns brightness.

## 2. Light rig (authored source: `src/data/sectorVisualProfiles.js`)

- Four lights only: ambient + key + rim + fill. No per-object lights in normal play.
- Helios reference (`helios_core`): ambient 0.20 / key 3.4 / rim 1.65 / fill 0.72.
- Bounds: ambient 0.12–0.25, key 2.2–3.6, rim 0.9–1.8, fill 0.35–0.8.
- Key color warm white (≈ 0xffe2bd core); rim cool blue (≈ 0x82baf0 core);
  fill is planet bounce (sector fill hue), placed low on the landmark side.
- Key direction follows the sector signature hero screen position
  (`renderer._aimKeyLightAtSignatureHero`): screen +x is world +x, screen +y is
  world −z. A sector without a hero keeps the construction rig.
- Sector transitions lerp color + intensity over 1.5 s
  (`SECTOR_VISUAL_TRANSITION_SECONDS`).

## 3. Materials (authored source: Forge `FINISHES` + `industrialMaterialFamilies.js`)

| Substance | Roughness | Metalness | Notes |
|---|---:|---:|---|
| Paint (`paint/paint2/stripe`) | 0.42–0.50 | 0.08–0.10 | Paint channels ≈ 0x30–0x90; Helios ivory `#bfb6a3` is the brightest allowed |
| Machinery (`gunmetal/dark/bare`) | 0.30–0.62 | 0.55–0.95 | Controlled highlight lives here, not on paint |
| Ceramic | 0.70 | 0.00 | Dry, no env sheen |
| Glass | 0.06 | 0.00 | Lit windows/nav lights read as signal, not paint |
| Geology (`stone`) | 0.92 | 0.00 | No machinery tile |
| Signal (`glow_*`) | 0.40 | 0.00 | emit 2.2–6.0 (drive 6.0, cyan/red/green/amber 3.0, warm 2.2) |

Runtime rescue layers (roughness noise, palette multiplies, pigment, synthetic
panel wells) apply to old exports only. Forge `forge-v1` bodies skip them.

## 4. Dynamic event lights (the VFX→lighting bridge)

Fixed pool, never reconfigured at runtime (light COUNT is baked into every lit
shader program; toggling count relinks the scene):

| Pool | Size | Owner | Lifetime |
|---|---|---|---|
| Event (`vfx._lights`) | 6 | `src/render/vfx.js` | transient flash + 1 sustained player-plume resident |
| Weapon (`WeaponLightPool`) | 2 | `src/render/weapons/weaponLights.js` | 0.05–0.12 s impulse discharge |
| Thruster recipe (`EventLightPool`) | ≤ 8 data-only | `src/render/thruster/systems/eventLight.js` | per-frame write, bridged into the event pool |

Total visible point lights: **8** (6 event + 2 weapon).

Rules:
- Every VFX flash that wants to light hulls routes through `vfx._flashLight`
  (player-proximate cull 700 WU, accessibility peak scale, priority admission).
  Sustained residents (player plume) are never eviction candidates for transients.
- Weapon lights are impulses: peak on spawn, `(1−t)²` decay with a hard leading
  spike; heavy dialects (siege-lance 4.2/20, concussion 3.6/18) outrank skirmish.
- Thruster light changes brightness under boost, never radius.
- Reduced motion: `eventLightPeakScale` 0 (steady propulsion cue retained).
  Reduced flash: 0.24. Both: 0.
- New in v1: `src/render/vfxColorLightDirector.js` maps VFX families to light
  color/peak/distance/priority in one table (`VFX_LIGHT_PRESETS`), so a muzzle,
  explosion, beam, shield, mining, thrust, or field event casts consistent light
  without each presenter inventing its own numbers. The pools above are unchanged.

## 5. Emissive + bloom (authored source: `src/render/bloom.js`)

- Engine cores, muzzle cores, explosion cores, nav/beacon/glow finishes, and
  shield seams are the only HDR emissive sources. Paint never emits.
- Bloom threshold 1.0 (science default −0.15), strength default 0.52, pyramid
  norm 1.5, coarse weight 0.36. Sector post scales strength/threshold mildly
  (±0.16 strength scale, ±0.10 threshold bias).
- Grade ≤ 0.35 (Helios 0.32), vignette 0.12, toe default 0.012 (cinematic 0.02),
  grain 0 except cinematic.
- Colored bloom is bounded: hot cores may bloom white/colored; shadowed paint
  must not bloom at any setting.

## 6. Budget (authored source: `design/PERF_BUDGET.md`)

Light-count cost is per-fragment on every lit material: NUM_POINT_LIGHTS 0→6→22
measured 77→119→329 ms on the reference D3D11 probe. Hence the fixed 8.
No new real-time lights without removing one or proving p95 holds on the
owner's iGPU class (`probe-frame-solid`, crowded Helios, before/after).

## 7. Agentic workflow (maximal quality loop)

1. `node scripts/audit-color-lighting.mjs` — inventory every VFX emitter,
   material role, and sector rig against this standard (fails on drift).
2. `node scripts/fleet-look.mjs --fleet --views=close` + open the PNGs —
   the live pipeline (Helios lights, shipping post), not a Blender still.
3. `node scripts/flight-look.mjs` — the real game; thrust + fire; check lit
   side vs shadow side, rim separation, flash reads on nearby hulls.
4. Fix at the shared layer when the defect is shared (this standard,
   `sectorVisualProfiles.js`, `industrialMaterialFamilies.js`, `bloom.js`,
   `vfxColorLightDirector.js`); fix the asset when it is one body (Forge).
5. Re-run the audit + focused tests
   (`test/sector-visual-profiles.test.mjs`,
   `test/vfx-color-light-director.test.mjs`); record before/after frame cost.
6. Never: add lights, widen pools, lower default quality, or re-record goldens.
