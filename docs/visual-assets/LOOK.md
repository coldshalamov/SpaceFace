# The Look — Working Hardware in Deep Space

Active art direction for the 3D picture. The 2026-11-14 owner review rejects the fleet's washed-out
paint, bright continuous neon, blurred spill and near-black shapes. Preserve the game's energetic
colour and distinct silhouettes, but make objects read as tangible, purposeful hardware with visible
surface detail and controlled light. The earlier "show car under stage light" direction explains the
current renderer; it is not the finish to copy into new work.

This page is the direction and the map of where it lives. It replaces the *picture* described in
[`ILLUSTRATED_GRAPHICS_STANDARD.md`](ILLUSTRATED_GRAPHICS_STANDARD.md) ("Lacquer & Starlight":
gouache shadows, ink contours, pastel lift). That page's implementation notes on models, VFX and
sky still describe real code. Numbers and budgets: [`COLOR_LIGHTING_STANDARD.md`](COLOR_LIGHTING_STANDARD.md).

## The picture

Working machinery with readable materials and form, under directional light in deep space.

1. **Surfaces have a job.** Paint, bare metal, insulation, glass and rock must look like different
   materials, with texture and relief suited to their scale. Avoid large featureless coloured or
   translucent primitives, repeated noise, and highlights that erase seams and texture.
2. **Light reveals form.** A key and restrained fill should leave structure legible on both the
   lit and shaded sides. Sector colours may tint the light; they must not turn every hull the same
   colour or crush dark ships into silhouettes.
3. **Light sources have a purpose.** Engines, navigation and task lamps keep their gameplay cues.
   Broad decorative strips and windows should not drown the hull in white or coloured blur; retain
   crisp, identifiable sources and use restrained spill. Paint and hazard markings do not emit.
4. **Space is deep, not a black cutout.** Keep the background quiet and give objects enough
   midtone separation to retain their silhouette and surface against it.
5. **Moods, not filters.** A place changes the colour relationship and the light level. It never
   changes what a hull is made of or washes out its identity.

## Fleet character

- **Institutions and official fleets:** controlled silhouettes, clean satin paint, deliberately
  placed markings, selective polished metal, compact navigation lights. Clean must still have
  material texture and visible construction.
- **Smugglers and pirates:** distinctive or improvised silhouettes, darker chromatic panels,
  selective repairs, abrasion and heat marks, sparse signals. Damage should tell a story rather
  than cover every surface in the same grunge.
- **Industrial and civilian workcraft:** practical painted plate, exposed service hardware,
  functional hazard colour and local task lighting. Different occupations retain their own accents.
- **Creatures and anomalies:** their own credible material and silhouette language, kept readable
  under the same scene lighting rather than forced into a uniform ship finish.

Starting points for a visual trial, not accepted defaults: satin hull paint roughness 0.42–0.55;
weathered work or raider paint 0.52–0.70; selected exposed metal 0.30–0.55. For broad decorative
signal finishes, test authored emission roughly 1.1–1.9 before the runtime signal gain; preserve
stronger small task lights and gameplay-critical tells where needed. Texture, tint, surface area,
runtime gain and tone mapping all affect the actual picture, so these numbers do not replace a
matched bright- and dark-sector review at gameplay scale.

The current shared implementation still uses the older lacquer/rim and high signal gains; the
above is the target for the ongoing calibration, not a claim that every existing model meets it.

## Lighting is light (owner, 2026-10-20)

The owner's direction: *a John le Carré ambience — dark, with lonely lights piercing the darkness,
spotlights splaying across the dark sides of ships, and powers that light up the space around them.*
An earlier pass faked this with geometry (stretched glowing spheres on every bow, a flat additive
fan for a beam, white glow strips around fields). It was ripped out. The rules:

- **Light is a THREE light.** A headlight, a power's glow or a flash is a real light that changes
  how nearby surfaces are shaded. Never add a mesh, sprite, fan, cone or strip that poses as light.
  In vacuum a beam is invisible; you see it only where it lands on a hull, rock or station.
- **The shaded side stays readable.** `LOOK_BASE.rig.ambientGain` / `fillGain` and the surface
  response control the shadow side. Keep directional form without burying texture or making a
  bright rim the only part visible; dark moods may be lower-key without becoming black cutouts.
- **Headlights** ([`src/render/headlights.js`](../../src/render/headlights.js), values
  `LOOK_HEADLIGHT`): a fixed pool of SpotLights mounted with the rig before shader warm-up. Slot 0
  rides the player's bow; the rest go to the nearest powered NPC hulls. Mounted high on the bow and
  pitched down, because the chase camera sees the tops of things. Switched by intensity, never by
  visibility (the light count is part of every shader program).
- **Effect lights are calibrated.** three.js measures point lights physically (inverse square). Every
  authored `peak` in [`vfxColorLightDirector.js`](../../src/render/vfxColorLightDirector.js) means
  the irradiance a surface receives `EVENT_LIGHT_REFERENCE_WU` from the light; `EVENT_LIGHT_GAIN`
  converts it once at the pool. Before this, an explosion lit nearby hulls at under 2% of the sun.
- **Running powers glow.** A live field holds a sustained slot in the existing event-light pool
  (`fieldSustain`, at most two), in its family colour, following the field's ignition and release.

## One owner

Every number that decides the vibe is a **Look value**, authored in one file and written to shared
shader uniforms by one module. Nothing else in the renderer hardcodes a look constant.

| What | Where |
|---|---|
| Authored moods (`arcade`, `neon_noir`, `sodium_yard`, `forge_heat`, `cold_drift`, `dust_gold`, `void_signal`), which sector wears which, lamp gain | [`src/data/lookMoods.js`](../../src/data/lookMoods.js) |
| Runtime: shared uniforms, mood lerp on sector change, tuning seam | [`src/render/look.js`](../../src/render/look.js) |
| Surface response (every lit hull): paint value and chroma, light bands, shadow and light tint, contour, clear coat, rim, paint ceiling | [`src/render/illustratedSurface.js`](../../src/render/illustratedSurface.js) (`sfLook*`) |
| Post: split-tone grade, contrast, saturation and vibrance, ink amount, bloom colour, vignette colour; three-scale bloom halo | [`src/render/bloom.js`](../../src/render/bloom.js) (`uLook*`), shared by `post/spaceRenderGraph.js` |
| Light rig: mood supplies the four light colours; the sector profile keeps intensities, sky and exposure | `resolveLookLighting` / `resolveLookPost`, called from `renderer.js` |
| Lamp rhythm (which lamps blink, flash-and-decay envelopes, reduced-flash steady gain) | [`src/data/lampChannels.js`](../../src/data/lampChannels.js); runtime [`src/render/lampBus.js`](../../src/render/lampBus.js) (`sfLamp*`) |

A mood is a small overlay on `LOOK_BASE`. To change the whole game's vibe, edit `LOOK_BASE`. To
change one place, edit its mood. To give a sector a different mood, edit `LOOK_MOOD_BY_PROFILE`
(or put `look: '<mood>'` on its visual profile).

| Mood | Sectors | Colour fight | Darkness |
|---|---|---|---|
| `arcade` | Helios, core trade space | warm white sun / electric cyan edge, ultramarine shadow | bright |
| `neon_noir` | Tethys Junction, frontier | rose key / cyan edge, magenta shadow | dark |
| `sodium_yard` | Sker Haven | sodium amber / cyan edge, deep blue shadow | dark |
| `forge_heat` | Vesta Forge | furnace orange / teal | medium |
| `cold_drift` | Pallas Drift | blue-white / violet edge, highest gloss | medium |
| `dust_gold` | Ceres, the belts | gold / slate teal | bright |
| `void_signal` | the anomaly | violet / acid green | dark |

## Lamps blink (the Lamp Bus)

A lamp is light, so it may have a rhythm. One shared clock (`tickLampBus`, once a frame from
`renderer.js`) feeds a flash-and-decay envelope in the emissive term of lamp materials: no extra draw
call, material, texture or per-frame allocation, and a floor above zero so a lamp never goes dark.
Reduced-flash (`settings.accessibility.flashReduce` / `video.flashReduce`) holds every channel at its
steady gain. Every channel stays under 3 flashes per second.

Which lamps blink is decided in data, never by base finish: `glow_amber`, `glow_cyan` and `glow_warm`
carry lit trims, dock lamps and window rows and must stay steady. Exactly two rules apply:

- **Hull nav lamps**: `Material_Emissive_NavRed` / `Material_Emissive_NavGreen` on a package whose slot is
  `hull` (`HOOK_NAV_PORT` / `HOOK_NAV_STARBOARD`) run the aviation rhythm, port and starboard half a cycle
  apart. Stations and props that use `glow_red` / `glow_green` stay steady.
- **Opt-in channel finishes**: a Forge recipe names a variant finish (`glow_amber.beacon`,
  `glow_cyan.strobe`, `glow_amber.breathe`). Forge exports it as `Material_Emissive_<Base>_<channel>`.
  `beacon`, `strobe` and `breathe` are reserved suffixes; never reuse them as colour names.

Phase is a cosmetic hash of the material's uuid (never `state.rng`). Nav lamps already get a ship-local
material clone for damage dimming, and the clone keeps the hook, so each hull staggers on its own and
phase stays put as it flies. Lamps are signal-role: they never wear the illustrated-surface shader.

## Judge it by the picture

```
node scripts/look-bench.mjs                                  # every mood x the reference hulls, one sheet
node scripts/look-bench.mjs --moods=arcade,neon_noir --view=inspect --bodies=kestrel,wasp
node scripts/look-bench.mjs --vary=patches.json --cost       # A/B single values, with GPU ms per cell
SF_GL=d3d11 node scripts/flight-look.mjs --sector=sector_sker_haven   # the real game on the real GPU
```

A `--vary` file is a list of columns: `{ "name", "mood", "sector", "tune": { "surface": {…},
"post": {…} }, "post": {…}, "lights": {…} }`. Open the sheet, keep the number that looks right,
write it into `lookMoods.js`. The bench runs on this machine's GPU (about five seconds a cell), so
look, do not guess.

## What it costs

Measured on the owner's machine class (Intel integrated, 1600x1000, live game, interleaved A/B,
2026-09-30): the coat, rim and the two extra bloom levels are inside run-to-run noise (under 1 ms)
at the opening, close zoom and the trade hub. The clear coat is one environment fetch and one loop
over the three sun lights, skipped on rough or metal surfaces. No lights, passes over a tenth of a
megapixel, textures or program variants were added. The final 8-bit encode carries a static
one-LSB triangular dither (`POST_DITHER_LSB` in `bloom.js`); it is measurable but small, about
0.06 ms on a 0.9 ms composite pass on the Intel iGPU in an isolated timing, not an in-game capture
(numbers and caveats: [COLOR_LIGHTING_STANDARD.md](COLOR_LIGHTING_STANDARD.md) §5).

Real-time key-light shadows stay off by default on integrated GPUs: the same A/B measured +0.7 ms
at the opening, +2.7 ms at close zoom and +14.6 ms (25%) at the trade hub. Discrete GPUs turn them
on (`video.shadows`). Depth on integrated comes from the contour, the split shadow colour and
occlusion authored into the models.

## Automatic resolution (2026-10-30)

Automatic quality trials internal-resolution bands during visible, unpaused flight after opening
admission and the loading veil have released. It retains a lower band only when frame time improves;
otherwise it restores the previous band. Named presets select Manual, and legacy custom settings
remain Manual. Actor counts, authored materials, models and effects settings are not reduced by the
controller. Auto uses the scale-aware bloom renderer; render-graph ambient occlusion remains a
Manual option, explained when both are selected.

The same-flight Intel D3D11 check exercised the public Balanced/Automatic controls, observed the
1.0 and 0.9 bands and restoration, and inspected the Tethys flight picture at gameplay camera.
The ship, rock surfaces, lights and trails remain readable. The 34-second comparison varied in
workload and therefore establishes no isolated frame-rate gain or whole-game performance bar.
Screenshots and cadence are retained in the local integration artifacts under
`prompt-deck-live-corrected/`; long-session acceptance remains separate.

## Rules for new work

- A new look constant is a Look value in `lookMoods.js`, never a literal in a shader.
- Material physics (roughness, metalness, emission) belongs to the Forge finish, the same in every
  mood. Moods own colour and amount.
- Paint never emits. Keep `paintCeiling` at or under 0.75 (current bloom threshold 1.0, knee 0.10).
- Bloom threshold stays 1.0: effect radiance is calibrated against it.
- A look change is reviewed on the bench sheet and in `flight-look`, in at least one bright and
  one dark mood.
