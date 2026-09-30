# SpaceFace color + lighting standard — v2 (2026-09-30)

Active color/lighting calibration for the live renderer. Companion to
[`LOOK.md`](LOOK.md) (art direction and the single owner of every look value), `FORGE.md` (authored bodies),
`sectorVisualProfiles.js` (per-sector rig), `bloom.js` (post), and the field/VFX
readability bibles. This file names numbers, not taste.

## 1. Rendering intent

Space is dark; ships are working hardware under one hard sun plus planet bounce.
Every lit frame answers three questions: where is the sun, which side is shadow,
and what just flashed. Nothing else earns brightness.

## 2. Light rig (authored source: `src/data/sectorVisualProfiles.js`)

- Four lights only: ambient + key + rim + fill. No per-object lights in normal play.
- Helios reference (`helios_core`): ambient 0.16 / key 3.4 / rim 1.72 / fill 0.55.
- Bounds: ambient 0.12–0.25, key 2.2–3.6, rim 0.9–1.8, fill 0.35–0.8.
- Contrast law: ambient/fill sit at the low end of their bands and the rim near
  the top — hulls must separate from space by silhouette light, not ambient lift.
- The four light colours come from the sector's mood (`src/data/lookMoods.js`
  `rig`): a key hue and an opposing rim hue, a fill and an ambient. `arcade`
  is warm white `0xfff0dc` against electric cyan `0x4fc8ff`; the darker moods
  push the split harder (rose/cyan, amber/cyan, violet/acid green). Fill is
  planet bounce, placed low on the landmark side.
- A sector profile may still pin a channel with `lighting.keyColor` /
  `fillColor` / `rimColor` / `ambientColor`; the pin wins over the mood. Vesta
  Forge, Pallas Drift, Sker Haven and Ceres pin their key and fill. The palette
  class still owns nebula, dust and fog. The key stays near white; the rim and
  the shadow colour carry the saturation.
- Key direction follows the sector signature hero screen position
  (`renderer._aimKeyLightAtSignatureHero`): screen +x is world +x, screen +y is
  world −z. A sector without a hero keeps the construction rig.
- Sector transitions lerp color + intensity over 1.5 s
  (`SECTOR_VISUAL_TRANSITION_SECONDS`).
- IBL (image-based light, `scene.environment` only — the visible sky is never
  touched): the authored deep-space env `assets/background/env/deep_space_2k.hdr`
  (`scripts/generate-space-ibl.mjs`, deterministic, mean-radiance-normalized
  to 1.0 at load/bake). Dark sky, compact warm sun lobe agreeing with the key,
  cool planet-bounce and rim fields, star-band glints for specular structure.
  The retired Poly Haven foundry HDRI stays on disk as an alternate source
  (`PROVENANCE.md`). PMREM capture stays at cube size 256 — the size is part of
  every lit program key.

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

Surface response is shared by every lit hull and owned by the Look
(`sfLook*` uniforms): paint shows close to its authored value (gamma 0.9), chroma x1.18;
smooth dielectric paint carries a clear coat whose weight is
`(1 − 0.85·metalness) · (1 − smoothstep(0.50, 0.95, roughness))`, so paint
(0.42–0.50) is fully coated, ceramic (0.70) partly, stone and bare metal not at
all; the coat adds a sun glint (gain 0.5), an environment mirror that rises toward
the limb, and the mood's rim colour, all fading on pigment that is already
bright. Lit pigment rolls off under `paintCeiling` 0.74. Rough stone takes a
softer, greyer version of the shadow colour and light bands.
Signal and drive emission is multiplied once at admission (`LOOK_EMISSIVE_GAIN`:
point lamps and trim x2.6, drive x1.7, `glow_warm` window rows x1.3) so lamps
read as light without a lit liner hiding behind its own haze.

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
  norm 1.5. The full quality tier builds four pyramid levels (1/2, 1/4, 1/8,
  1/16) and composites three: tight 1.0, body 0.62, wide 0.48 — the wide levels
  are what make a lamp read as neon. Sector post scales strength/threshold
  mildly (±0.16 strength scale, threshold bias ≤ 0).
- Grade, contrast, saturation, ink, bloom colour and vignette are Look values
  per mood (`post`): grade amount 0.7–0.9, vignette 0.20–0.34, contrast
  1.12–1.22, saturation 1.10–1.22, ink ≤ 0.26 (the retired pass ran 1.0). Toe
  default 0.012 (cinematic 0.02), grain 0 except cinematic.
- Colored bloom is bounded: hot cores may bloom white/colored; shadowed paint
  must not bloom at any setting.

## 6. Budget (authored source: `design/PERF_BUDGET.md`)

Light-count cost is per-fragment on every lit material: NUM_POINT_LIGHTS 0→6→22
measured 77→119→329 ms on the reference D3D11 probe. Hence the fixed 8.
No new real-time lights without removing one or proving p95 holds on the
owner's iGPU class (`probe-frame-solid`, crowded Helios, before/after).

## 7. Agentic workflow (maximal quality loop)

1. `node scripts/audit-color-lighting.mjs` — inventory every VFX emitter,
   material role, sector rig and mood against this standard (fails on drift).
2. `node scripts/look-bench.mjs` for a look value (moods x hulls, one sheet);
   `node scripts/fleet-look.mjs --fleet --views=close` for the fleet. Open the
   PNGs — the live pipeline, not a Blender still.
3. `node scripts/flight-look.mjs` — the real game; thrust + fire; check lit
   side vs shadow side, rim separation, flash reads on nearby hulls.
4. Fix at the shared layer when the defect is shared (`lookMoods.js` first,
   then `sectorVisualProfiles.js`, `industrialMaterialFamilies.js`,
   `vfxColorLightDirector.js`); fix the asset when it is one body (Forge).
5. Re-run the audit + focused tests
   (`test/sector-visual-profiles.test.mjs`,
   `test/vfx-color-light-director.test.mjs`); record before/after frame cost.
6. Never: add lights, widen pools, lower default quality, or re-record goldens.
