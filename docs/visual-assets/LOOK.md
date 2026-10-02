# The Look — Neon Industrial

Active art direction for the 3D picture (owner, 2026-09-30). The owner's words: *fast-paced, cool,
bright arcade game with shiny, cool-looking models; sometimes a darker, cyberpunk-ish vibe; lean
into colour contrast.* The earlier picture read as cheap: matte, pastel, flat, one colour per hull.

This page is the direction and the map of where it lives. It replaces the *picture* described in
[`ILLUSTRATED_GRAPHICS_STANDARD.md`](ILLUSTRATED_GRAPHICS_STANDARD.md) ("Lacquer & Starlight":
gouache shadows, ink contours, pastel lift). That page's implementation notes on models, VFX and
sky still describe real code. Numbers and budgets: [`COLOR_LIGHTING_STANDARD.md`](COLOR_LIGHTING_STANDARD.md).

## The picture

Working machinery finished like a show car, under stage light, in black space.

1. **Paint is lacquer.** Saturated colour at its authored value under a clear coat: a hard sun
   glint, a mirror of the sky at the limb, and the panel texture breaking the gloss up plate by plate.
2. **Two colours fight in every frame.** Each place has a key hue and an opposing edge hue (warm sun
   against electric cyan; amber sodium against deep blue; rose against cyan). Shadow sides are never
   grey: they take the mood's shadow colour.
3. **Lamps are light.** Nav lights, windows, neon trim and drives sit far above the bloom threshold
   and spill tens of pixels. Paint never glows: lit pigment rolls off below the threshold.
4. **Space is black.** Contrast and the grade push the void down so the action has somewhere to
   explode. The sky is rich but quiet.
5. **Moods, not filters.** A place changes the colour relationship and the darkness. It never
   changes what a hull is made of.

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
megapixel, textures or program variants were added.

Real-time key-light shadows stay off by default on integrated GPUs: the same A/B measured +0.7 ms
at the opening, +2.7 ms at close zoom and +14.6 ms (25%) at the trade hub. Discrete GPUs turn them
on (`video.shadows`). Depth on integrated comes from the contour, the split shadow colour and
occlusion authored into the models.

## Rules for new work

- A new look constant is a Look value in `lookMoods.js`, never a literal in a shader.
- Material physics (roughness, metalness, emission) belongs to the Forge finish, the same in every
  mood. Moods own colour and amount.
- Paint never emits. Keep `paintCeiling` at or under 0.75 (bloom threshold 1.0, knee 0.25).
- Bloom threshold stays 1.0: effect radiance is calibrated against it.
- A look change is reviewed on the bench sheet and in `flight-look`, in at least one bright and
  one dark mood.
