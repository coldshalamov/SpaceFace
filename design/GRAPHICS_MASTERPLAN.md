# SpaceFace Graphics Master Plan + Plain-English Technique Guide

Two jobs: (1) teach you the vocabulary so you can direct the look precisely, and (2) lay out an honest,
prioritized plan to upgrade the whole graphics stack — tuned to a **no-dedicated-GPU laptop** and to
the fact that a second agent is editing `src/render` for performance.

The operational asset checklist lives in `GRAPHICS_UPGRADE_PLAN.md`. This doc is the strategy + glossary.

---

## The one idea: graphics is built in LAYERS

A 3D object becomes a screen pixel by passing through ~5 layers. Each is a separate place to make it
look better. We've only worked the top one (the shapes). The rest is where most of the "expensive" look
lives — and several layers are cheap on weak hardware.

### Layer 1 — SHAPE (geometry)  ·  status: doing well in Blender
The 3D model itself: **vertices/polygons** form a **mesh**; **topology** is how the polygons flow;
**silhouette** is the outline (what reads at a distance — most important for a top-down game); **LODs**
are simpler copies shown when far away.
- Pro move we haven't used yet: **high-poly → bake.** Sculpt a model with tons of detail (rivets,
  panels, wear), then *transfer* that detail onto a cheap low-poly model as texture maps (see Layer 2).
  You get film-level surface detail at a low polygon cost. This is the standard AAA workflow.

### Layer 2 — SURFACE (materials & textures)  ·  status: FLAT — our single biggest win
This is your "skins / pasted textures" intuition, and it's the most underused layer. Modern games use
**PBR (Physically Based Rendering)**: a material isn't one painted picture — it's a *stack* of texture
maps, each controlling one physical property of the surface:
- **Albedo / Base Color** — the flat paint color (no baked shadows). [your "texture/skin"]
- **Normal map** — THE thing you described as "a 3D texture layered on to look different." A special
  (purple-ish) image that stores which way the surface tilts at every pixel, so light reacts as if there
  are bumps, grooves, rivets, dents — **with zero extra polygons.** A flat plate looks deeply machined.
  The single biggest "free detail" trick in 3D.
- **Roughness map** — matte vs. mirror per spot (scuffed vs. polished metal).
- **Metalness map** — which parts are bare metal vs. paint/plastic.
- **Ambient Occlusion (AO) map** — soft self-shadow in crevices; adds depth and "grounds" the form.
- **Height / Displacement / Parallax** — fakes (or makes) deeper relief than a normal map.
- **Emissive map** — which parts glow (engine cores, windows, decals).
Right now I generate FLAT placeholder maps (clean panel lines, no real bumps). The upgrade: **bake real
normal + AO maps from sculpted/high-poly detail** → the hulls get genuine rivets, weld seams, grime, and
battle wear. This is the "we need textures" you sensed, done the modern way.

### Layer 3 — LIGHT (lighting)  ·  status: basic
How light reaches surfaces. Terms: **direct lights** + **ambient** fill; **shadow maps**; **Global
Illumination (GI)** = light bouncing between surfaces (realistic, expensive); **Image-Based Lighting
(IBL) / environment map** = using the surroundings (our nebula) as a light + reflection source (we
already bake one of these). **Ray tracing** is the gold-standard way to compute light/shadows/reflections
by simulating actual rays — it's gorgeous but needs a powerful dedicated GPU in real time, so **your
laptop cannot do it live.** The pro trick for weak hardware: **bake** ray-traced-quality lighting and AO
*offline in Blender* into the texture maps, so at runtime it's just a cheap texture lookup. Free realism.

### Layer 4 — EFFECTS (shaders)  ·  status: a few
A **shader** is a tiny program that runs on the GPU and decides the color of every pixel (and the
position of every vertex). Normal materials are shaders under the hood; **custom shaders** let us make
things that aren't just "a lit surface": energy **shields** (the cyan bubble), **force fields**,
**holograms**, the **nebula**, **warp** distortion, **dissolve-on-death**, and **fresnel rim-light**
(surfaces glow brighter at glancing edges — that sci-fi sheen). Cheap if kept simple; huge style payoff.

### Layer 5 — FILTER (post-processing)  ·  status: BLOOM only — big cheap win
After the 3D frame is drawn, we run image filters over the whole picture. A *lot* of the "AAA polish"
comes from here, and most of it is cheap:
- **Bloom** — bright things bleed glow (we have this).
- **Tone mapping (e.g., ACES)** — maps over-bright HDR values onto a filmic curve instead of harsh white
  clipping. One of the biggest single perceived-quality jumps; deferred so far for a bloom-invariant
  reason (see `spaceface-skills-spec`) — worth doing right.
- **Color grading** — push the palette for mood (the cinematic teal-orange look).
- **Anti-aliasing (FXAA / SMAA / TAA)** — smooths jagged edges; low-poly benefits a lot.
- **SSAO** — screen-space ambient occlusion: real-time contact shadows in crevices.
- **Vignette** (darkened corners), **film grain**, **chromatic aberration** (lens color fringe at edges),
  **depth of field**, **motion blur**, **god rays / volumetric light**.

### Layer 6 — VFX (particles)
Trails, explosions, muzzle flashes, sparks, smoke, debris, dust. Built from **particle systems** +
**sprites** + **additive blending** (glowing things add their light). We have some procedurally; can go richer.

---

## The honest hardware reality (and the strategy that beats it)

No dedicated GPU means: NO real-time ray tracing, NO heavy global illumination, NO big particle storms,
and we must be judicious stacking expensive per-pixel post. That is NOT a quality ceiling — it just
changes the technique. The winning strategy on weak hardware is what stylized and mobile games do:

1. **Bake the expensive realism offline.** Compute AO, normal detail, and even lighting in Blender, save
   it into the texture maps. The laptop just samples textures at runtime — cheap.
2. **Add a light, cheap post-processing layer.** Tone mapping + anti-aliasing + vignette + grade is a
   massive perceived upgrade for little cost.
3. **Lean on art direction** (palette, contrast, value, composition, restraint) — costs nothing and
   matters most. A well-lit, well-graded low-poly scene beats a poorly-lit high-poly one.

So "make it look AAA" on this machine = great baked PBR materials + a tasteful post stack + strong art
direction + a few hero shaders. Not ray tracing.

---

## Prioritized roadmap (impact × cheapness × low risk first)

**Tier 1 — Finish the model set (Blender, zero engine edits, in progress)**
- Engines ×3, weapons ×3 remaining → completes the ship "trio."
- Then world props: **asteroids** (≈90 fill every mining belt — currently crude), **station** (hub
  centerpiece), pickups/ore, jump gates. These need one small fallback-guarded GLB-prop loader.

**Tier 2 — Real PBR texture sets for the hero assets (Blender bake, zero engine edits)** ← biggest look jump
- Sculpt/greeble high-detail versions of the player ship + common hulls; **bake normal + AO + curvature**
  into proper maps. Replace the flat placeholder textures. Panels gain real rivets, seams, wear, grime.
- Still GPU-free at runtime (baking is offline; runtime just samples).

**Tier 3 — Post-processing stack (engine `src/render`, coordinate with perf agent)** ← biggest cheap win
- ACES tone mapping (done correctly in the bloom composite), color grade, SMAA anti-aliasing, subtle
  vignette + grain. Optional SSAO if the frame budget allows.

**Tier 4 — Hero shaders (engine, targeted)**
- Upgrade shields (fresnel + animated hex), engine plumes (animated noise + heat haze), weapon
  beams/bolts, the nebula, and warp with custom shaders.

**Tier 5 — Lighting & world depth**
- Bake AO/GI into assets; richer environment map; considered 3-point key/rim/fill; parallax distant
  layers; better contact shadows.

**Tier 6 — VFX polish**
- Richer engine trails, layered explosions, impact sparks/debris, screen shake, hit flashes.

Sequencing note: Tiers 1–2 are **asset-only** (safe to do now, no collision with the perf agent). Tiers
3–5 touch `src/render` — best done once the perf agent's refactor settles, to avoid stepping on each other.

---

## Your trigger-word cheat sheet (say these and I'll know exactly what to do)

- **"Give it a full PBR texture set / bake real normal + AO maps"** → rich, detailed surfaces (Layer 2).
- **"Sculpt high-poly detail and bake it down"** → film-grade detail on cheap models (Layers 1–2).
- **"Add a post-processing stack: ACES tone mapping, color grading, SMAA, vignette"** → cinematic frame (Layer 5).
- **"Bake the lighting / ambient occlusion in Blender"** → expensive look, cheap runtime (Layer 3).
- **"Write a custom shader for X with fresnel rim-light"** → glowing energy effects: shields, plumes (Layer 4).
- **"Add a particle system for X with additive blending"** → trails, sparks, explosions (Layer 6).
- **"Improve the silhouette / topology / add a high-detail LOD"** → better shapes (Layer 1).
- **"Set the art direction: palette, contrast, mood"** → cohesive look (free, highest leverage).

And the honest one: **"ray tracing"** in real time isn't on this laptop — but say **"bake ray-traced
quality offline"** and you get most of the look for free.
