# Surfacing and light pass — record (2026-09-30)

Owner brief: surfaces look cheap (matte, reddish, monochrome, no real surfacing) and light is not
handled artistically. Give the game a **vibe**: a fast, cool, bright arcade game with shiny models,
sometimes darker and cyberpunk, leaning on colour contrast. Design and refactor the global system for
lighting, shadows and filters, then unify the surfacing on the models.

The direction and the system now live in [`docs/visual-assets/LOOK.md`](../../docs/visual-assets/LOOK.md).
This page records what the pass did and what is left. An earlier lane opened this file as a plan and
went quiet; its finished work (the illustrated-surface frequency separation and the authored
deep-space reflection environment) was adopted into this pass.

## Why it read cheap

Every cause was a deliberate choice of the earlier "gouache illustration" direction:

| Cause | Where it was | What replaced it |
|---|---|---|
| Paint lifted toward pastel (`pow(albedo, 0.80)`) | `illustratedSurface.js` | Paint near its authored value (gamma 0.9), chroma x1.18 |
| No gloss: paint at roughness 0.46 with one soft lobe | Forge finishes + surface shader | Clear coat: sun glint, sky mirror at the limb, coloured rim |
| Light squeezed into poster bands, violet ink on every edge | surface shader + composite | Band share 0.34, ink 0.18, both Look values |
| Nothing glowed: a two-level bloom pyramid spills about two pixels | `bloom.js` | Four levels, three composited; lamps lifted at admission |
| Indoor workshop reflections | `foundryEnvironment.js` | Authored deep-space environment with a two-tone strip light |
| One neutral grade for every place | sector profiles | Seven moods: a key hue against an opposing edge hue |
| The panel tile read as bathroom tile | `forge_textures.py` | v2 plating: recessed seams, dog-eared plates, uniform albedo |
| Look numbers hardcoded across eight files | renderer | One owner: `src/data/lookMoods.js` + `src/render/look.js` |

## What landed

1. **The Look system** — moods, shared uniforms, sector mapping, lerp on jump, bench tool.
2. **Surface response v13** — coat, rim, paint ceiling, gloss headroom on pale paint, softer
   treatment on rough stone.
3. **Post** — mood split-tone, contrast, saturation/vibrance, ink amount, bloom and vignette colour;
   wide bloom halo.
4. **Reflection environment** — deep-space env with warm/cool strip light and cyan rim lobe.
5. **Forge plating v2** — new shared tile set; all 108 Forge bodies republished.
6. **Tools** — `look-bench.mjs` (moods x hulls, A/B patches, GPU cost), real-GPU captures
   (`SF_GL=d3d11`), `flight-look --act`, `fleet-look` fixed for places.
7. **Interface art** — hull posters re-rendered with the Look restated for Cycles.

## Measured on the owner's machine (Intel integrated GPU)

Live game, interleaved A/B, 1600x1000: the Look's added work is inside noise (under 1 ms). Key-light
shadows cost +0.7 ms at the opening, +2.7 ms at close zoom and +14.6 ms (25%) at the trade hub, so
they stay opt-in on integrated GPUs and default on for discrete ones.

## Left for a later pass

- **Occlusion baked into the models.** The biggest remaining depth cue. Blocked on one fact: the
  project's GLB loader ignores `COLOR_0`, and the render-package compiler would need to carry it.
  With that in place, a Cycles vertex-colour AO bake in `forge_export.py` is a day of work.
- **Per-hull neon trim.** The Wasp family shows what lit trim does. Most civilian hulls carry only nav
  lights; a thin `glow_*` strip in each hull's identity colour is a per-ship art pass
  (`tools/blender/forge/briefs/`).
- **Sky per mood.** The sky takes the grade but keeps its own palette. Each dark mood wants a plate
  in its own two hues.
- **Older-pipeline bodies.** The Asteroid Works board pieces and the Wreck Cathedral are not Forge and
  do not carry the v2 plating.
- **Edge quality.** The scene target is single-sampled; thin seams stair-step at 1x device pixels.
