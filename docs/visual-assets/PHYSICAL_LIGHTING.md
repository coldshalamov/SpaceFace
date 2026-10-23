# SpaceFace: physical local-light authoring (October 2026)

## Contract
A **light source** is a physically shaded `THREE.PointLight` or `THREE.SpotLight`; an emissive
material is the *visible bulb*, not a substitute for that light. Bloom amplifies HDR pixels but
does not illuminate neighboring geometry. Vacuum does not show searchlight beams: the player sees
their **footprints on hulls, cliffs, decks and particulate matter**, not opaque cones or soft quads.

This PR supplements the existing Look rig, `HeadlightPool`, bloom, and VFX color director.
Do not invent an additional light census, postprocess pass, shader variant, or glowing geometry
to mask a missing light. Mood colours, ambient/fill/grade stay in `src/data/lookMoods.js`
and `docs/visual-assets/LOOK.md`. Surface physics and emissive finishes remain Forge-owned.

## Implemented categories
| Source | How to apply | Actual local lighting |
| --- | --- | --- |
| Player/NPC searchlight | existing `HeadlightPool`; socketed future variants | 3 real, shadowless `SpotLight`s |
| Dock/service lamp | nearby `station` entity; `dock` profile | amber `PointLight` |
| Industrial furnace | station defId contains forge/refinery/foundry, or explicit `refinery` | hot orange `PointLight` |
| Research bay | station research/laboratory, or explicit `research` | cold cyan `PointLight` |
| Customs/security | station military/security/customs, or explicit `security` | warning red `PointLight` |
| Transit gate | gate entity, or explicit `gate` | violet `PointLight` |
| Powered wreck | `data.emergencyLight: true` / `data.reactorActive: true` | red alarm / cyan reactor `PointLight` |
| Luminous ore | `data.oreGlow: true`, not *every* asteroid | green mineral `PointLight` |
| Alien biology | `data.lightFixture: 'biology'`, or marked luminous anomaly | sickly chartreuse `PointLight` |
| Living field, player plume, damage contact, explosions and weapons | existing VFX event-light director | real pooled point lights |

All fixtures are proximity selected by `src/render/ambientFixtures.js`; the VFX update owner
binds them into two *borrowed slots of the existing six-light event pool* at 4 Hz while
updating positions each frame. No light is added to the shader-program census. A fixture
lives at the emitting structure; origin rebasing uses the existing frame membrane.
A dynamic world object should expose a proper, stable emitter position in its presentation
record rather than creating transient lights per mesh. A second model-socket pass can later
read Forge GLB emission tags at admission time and attach world-space anchors without scanning
the scene or changing the pool.

## New asset integration
1. Give the asset a physically plausible *visible* luminous finish in Forge
   (`glow_amber`, `glow_cyan`, `glow_red`, etc.), not a fake cone or unlit halo.
2. On the owning world entity set `data.lightFixture = 'refinery'` (one of the named
   presets in `AMBIENT_FIXTURE_PROFILES`). Set `false` to disable auto-classification.
   The presenter **reads** this metadata and never mutates the simulation.
3. When the source can go out, set `data.powered = false` or remove/retire the entity.
   When emitted only after damage, explicitly opt in at the causal moment.
4. Choose physical intensity with `peak` meaning the approximate irradiance at 22 WU.
   `EVENT_LIGHT_GAIN` does the inverse-square conversion once. Set cutoff `range`
   for screen relevance, not a fake spot graphic.
5. Capture from the actual game camera in both `arcade` and `sodium_yard` or
   `neon_noir`. Inspect actual nearby geometry dark/light response and HDR clipping.
   Report target integrated-GPU P50/P95 frame cost; do not rely on a static GLB studio render.

## Scarcity and safety
- Three fixed headlights; six fixed event lights; two separately owned weapon lights.
  `AMBIENT_FIXTURE_RESERVE=2` prevents sustained scenery/fields/plumes from using the
  final two *free* slots. Stronger field/gyre effects can evict low-priority fixture residents;
  flashes still use transient priority eviction. No `light.visible=false`: toggle by intensity.
- Only **two** nearby environmental emitters are selected, not one light per station lamp,
  window, ore shard, thruster, or mesh. Persistent fields get priority over scenery.
- The surface ceiling applies to sun/ambient pigment, not positively evaluated local
  illumination. Spot/point falloff and colour therefore remain physical and can bloom.
- No ray-traced or shadow-mapped local-light occlusion is claimed. These are genuine surface
  lights but can bleed through walls. Local shadows, occlusion probes, emissive textures,
  fixture sockets, flicker with accessibility and expanded model coverage require separate
  measured art/engineering passes.
- Run: `node --test test/ambient-fixtures.test.mjs`,
  `node --test test/headlights.test.mjs`, focused VFX integration,
  `node scripts/look-bench.mjs --moods=arcade,sodium_yard`, and normal-flight capture.
  Browser/GPU acceptance **must not** be inferred from passing source tests.
