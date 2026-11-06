<!-- LIFETIME: ACTIVE_PROGRAM -->
# LOOK — luminous, readable, alive (fixing dark-on-dark and cheap bloom)

**Owner, 2026-11-06:** "the visual style is just dark on dark, it's hard to see what's going on … I was
imagining lighting like in the Fable games — bloom lighting that made things feel luminescent and
magical, but when I ask for it I only get literal cheap HTML bloom … the visual style isn't taking
advantage of what we have."

This file is the art direction for **light**. It extends `docs/visual-assets/LOOK.md` (the record of
look decisions and sacrifices) and `design/program/finish/MASTER_PLAN.md` X1 (one art direction).
Look values live in `src/data/lookMoods.js` [EXISTS]; the bloom/composite pipeline is
`src/render/bloom.js` [EXISTS]; the look bench is `scripts/look-bench.mjs` [EXISTS].

---

## 1. Diagnosis — why it looks dark and cheap

1. **Luminous was solved as blur, then the blur was removed.** On 2026-10-27 the owner said bloom made
   ordinary geometry "blurry where it shouldn't be"; the fix lowered strength, sharpened the knee and
   quietened the halo so only HDR emissive > 1.0 radiates and lit paint is capped at 0.74. That fixed
   the blur — and left only tiny hot dots glowing. **Glow on a few pixels over dark hulls on a black sky
   reads as cheap.**
2. **Too few things emit light.** The scene has a handful of emissive points (engines, shots). Fable,
   Ori, Hades, Destiny: dozens of designed light sources per screen — windows, strips, runes, energy,
   lanterns, particles — each modest, together luminous.
3. **Light doesn't touch anything.** Glows don't illuminate nearby hulls or rocks; there's no haze for
   light to travel through. Real luminosity is light *spilling* onto surfaces and air.
4. **ACES tone mapping crushes the darks** and pulls saturated colours toward white/desaturated —
   dark hulls go darker, coloured lights lose their colour.
5. **Value structure is flat:** dark hulls, dark rocks, near-black sky — the gameplay layer and the
   background sit in the same value band.

## 2. The target — "luminous industrial"

**Crisp geometry, glowing sources, light that lands, air that holds light.** Reference qualities (from
what you know, no videos needed):

| Reference | The quality |
|---|---|
| **Fable II/III** | soft, wide, warm glow around light sources; golden-hour air; magic that lights its surroundings |
| **Ori and the Will of the Wisps** | the playfield glows against a mid-dark, colourful background; every interactive thing has a light |
| **Hades** | strong silhouettes with rim light; saturated accents; dark but never murky |
| **Destiny 2** | luminous sci-fi: energy that blooms, crisp hard-surface metal, atmospheric haze, coloured light pools |
| **Tron: Legacy / Geometry Wars** | emissive line work as a graphic language |
| **Blade Runner 2049** | coloured haze, light shafts, silhouettes against glow |

**The one-sentence bar:** *a screenshot looks like it's lit by its own lights — engines, windows,
strips, shots and explosions colour the hulls and the air around them — while every ship stays
sharp, readable and distinct from the background.*

## 3. Value structure (fixes dark-on-dark)

Measured on a grayscale version of a gameplay-zoom screenshot (luminance 0–100):

| Layer | Target luminance | Notes |
|---|---|---|
| Deep background (sky) | 6–15, never a large area of pure 0 | nebula colour and stars carry it |
| Mid background (nebula, distant planets, haze) | 15–35 | colour, soft, out of the way |
| Terrain (rocks, wrecks) | 25–50 lit side, 10–20 shadow side | rim-lit edges |
| Ships (hull) | 35–65 lit, rim 70–85 | hulls lighter than the rocks they fly past |
| Gameplay lights (engines, shots, strips) | 85–100 + bloom | the brightest things on screen |
| UI | white/near-white text, never competing with shots | |

**Rules:**
- **Three-value squint test:** blur the screenshot heavily — the player ship, the enemies and the
  hazards must still be distinguishable blobs from the background.
- **Every gameplay body gets a rim light** from the sector's key light direction (and a second,
  coloured fill from the sector's secondary light). Rim beats everything for readability on dark.
- **No pure-black hulls.** Hull albedo values ≥ 0.18 linear for painted metal; dark factions use dark
  *colour* (deep red, navy), not black.
- **Sky never pure black over large areas** — Freelancer and EVE skies are colourful.

**Tooling (build it — ASSETS/A10):** a `look-values` probe that, for a capture, reports luminance
histograms for masks (player, enemies, terrain, background) and fails if the gameplay layer isn't at
least 20 luminance points above the background median. Run it on every look change.

## 4. The light pipeline — what to build

### 4.1 Tone mapping
- A/B **AgX** and **Khronos PBR Neutral** (both in three.js) against ACES on the look bench. Pick the
  one that keeps saturated emissive colours and lifts the toe. Expect AgX or Neutral to win.
- Exposure per sector stays in `lookMoods.js`; most sectors want a slightly higher exposure than today.

### 4.2 Bloom that glows without blurring
- **Energy-conserving mip-chain bloom** (the Call of Duty: Advanced Warfare / Jimenez 2014 method):
  a 13-tap downsample chain of 6 levels (½ → 1/64) with a **Karis average on the first downsample**
  (kills fireflies), a 3×3 tent upsample chain, and a **final mix, not a threshold add**:
  `scene = lerp(scene, bloom, 0.03–0.08)`. Because it's a mix of a very blurred copy, geometry edges
  stay crisp (the 10-27 blur complaint came from a strong, tight halo on mid-bright paint) while every
  bright source gets a wide, soft, luminous halo.
- **Soft knee** at ≈ 0.9–1.2 so only genuinely bright pixels contribute strongly; paint stays crisp.
- **Cost budget:** ≤ 1.5 ms on the laptop iGPU at the auto-selected resolution (start at ½ res; the
  deep levels are tiny). Prove it on the E10 dashboard.

### 4.3 More light sources, authored at HDR
The biggest win. Emissive values in linear HDR (scene-referred), so they bloom and survive tone mapping:

| Source | Emissive (≈) | Notes |
|---|---|---|
| Engine cores | 10–30 | white-hot core, faction-tinted sheath (exists: drive heat) |
| Shots / beams | 10–40 | weapon-family colour (VERBS §2) |
| Running lights, strobes | 4–12 | faction light pattern (WORLD §2) |
| Hull light strips / trims | 2–6 | the "lit identity trims" [EXISTS on 13 hulls] — extend to every hull |
| Station windows | 1.5–4 | hundreds of small warm windows = a city at night |
| Hotspot work lights, floodlights | 6–15 | with light shafts (§4.5) |
| The Line (rope) | 15–30 | the brightest moving thing on screen |
| Brood | 2–6 per family colour | they must glow (BESTIARY) |
| Explosions | 30–80 peak, decaying | ring + core + embers |

**Glow budget per screen:** total bloom energy capped so a big fight never washes to white (a running
average fed back into exposure — "eye adaptation" with slow response, ≈ 0.5 s up, 1.5 s down).

### 4.4 Light that lands
- **Engine and weapon light pools:** each ship's engine (and big weapon fire) casts a coloured point
  light on nearby hulls and rocks — capped light pool [EXISTS: "a capped light pool"], prioritised by
  size and distance to the player. A boosting engine visibly lights the rock beside it.
- **Explosion flash lighting:** a brief, large, coloured point light at each big explosion (lights the
  surrounding debris and hulls), decaying over 0.3–0.6 s — **this is what makes explosions feel like
  real light** instead of a sprite.
- **Fake light where real lights are too expensive:** additive "light cards" (soft gradient quads) on
  surfaces under lamps and floodlights; emissive-proxy rim on hulls passing near bright sources.

### 4.5 Air that holds light
- **Depth haze** in sector colours (2–3 layers with parallax).
- **Dust motes and drifting particles** in Hotspots and arenas that catch light (cheap instanced
  sprites).
- **Light shafts:** additive soft cones from floodlights and windows through dust (Hotspots, the
  Foundry arena). Not screen-space god rays — authored soft cones, cheap and controllable.
- **Heat shimmer** behind engines at boost (cheap refraction; reduced-motion off).

### 4.6 Materials that take light
- Painted metal mid-value albedo, roughness 0.35–0.6 so highlights travel across hulls as they turn.
- Panel variation (KIT K5) so light reads form.
- A clear-coat look for police and corporate liveries; dull scrap for pirates — light says faction.

### 4.7 Grade per sector
Each sector's palette (WORLD §1) as a grade (LUT [EXISTS: bloom contrast LUT]) plus its key light
direction and colour, secondary fill colour, haze colour and exposure in `lookMoods.js`.

## 5. Readability rules that the look must never break

- Danger telegraphs (red lines, rings) draw above all VFX and are never bloomed into mush.
- The player is cyan + gold only; enemies warm; Brood toxic (BESTIARY).
- No flash > 15% of screen or > 0.2 s at full white (SWARM §4) — explosions are big in the world.
- Text never sits on a bloom hotspot.

## 6. Golden frames and the workflow

1. **Golden frames:** 12 fixed camera setups (title hangar; Helios station rush hour; Big Dig; a
   Swarm Foundry wave-1 and wave-10; a Ceres belt flight; a Veil storm; a big explosion; a boss; the
   ship sheet; a heat-5 chase; a dark Charon zone). Capture all 12 **before** any look change.
2. Change one thing (tone map, bloom chain, emissive pass, haze, rim). Re-capture all 12.
3. **Review:** R8 (VFX and light) and R6/R5 readability by an independent reviewer; the look-values
   probe passes; the squint test passes; frame time on the E10 dashboard within budget.
4. Record the decision and any sacrifice in `docs/visual-assets/LOOK.md`.

**Owner sign-off:** the X1 art-direction lineup (master plan) shows the golden frames before/after;
the owner approves the direction once; after that, agents iterate within it.

## 7. Done for the look

- [ ] Golden frames before/after; owner approved the direction.
- [ ] Squint and look-values tests pass on all 12.
- [ ] A screenshot of any busy moment shows ≥ 20 distinct light sources and coloured light landing
      on hulls/rocks/air.
- [ ] Explosions light their surroundings.
- [ ] Geometry edges crisp at 100% zoom (no blur complaint); bright sources have wide soft halos.
- [ ] Bloom + haze + light pool ≤ 3 ms total on the laptop iGPU at the auto tier.
- [ ] R8 ≥ 4 on every golden frame.
