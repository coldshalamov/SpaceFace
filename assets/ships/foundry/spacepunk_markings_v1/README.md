# Spacepunk markings V1

Status: **authoring source only**. Nothing in this directory is selected by the default runtime,
copied into a GLB, or admitted by a release manifest yet.

This package turns SpaceFace's faction and ship history into a deterministic decal/emissive source
atlas. It is deliberately not a generic collection of skulls, fake alien letters, or recolored
military badges.

## Contents

- `markings_basecolor.png` — sRGB RGBA paint, stencil, serial, service, and non-emissive backing.
- `markings_emissive.png` — sRGB RGBA emission only. Transparent cells are intentionally dark.
- `markings_atlas.json` — stable pixel rectangles, normalized image rectangles, channel declarations,
  story rationale, colors, coverage, hashes, and the integration contract for all 32 cells.

Regenerate:

```powershell
node tools/art/build_spacepunk_markings_atlas.mjs
node tools/art/build_spacepunk_markings_atlas.mjs --check
```

The generator owns all production pixels, exact text, packing, and wear. The paired maps share one
2048×1024 layout of 8×4 cells, each 256×256. It uses deterministic procedural marks and a small
authored stencil alphabet; generated text is never consumed.

## Image-generation role and provenance

`assets/concept/factions/spacepunk_markings_motif_study_v1.png` is a project-original image generated
with the built-in image-generation tool on 2026-07-27. It is reference input only. The production
atlas does not copy its pixels.

The final generation prompt requested an orthographic charcoal concept board of 24 isolated,
stencil-friendly motifs in six unlabeled cultural families: Free Frontier/Borrowed Time, The Quiet,
Meridian and counterfeits, Solar Concord custody/rescue, Drift working crews, and Crimson
Reach/Pitborn. It required strong negative space, thumbnail legibility, at most two inks per motif,
subtle paint wear, no text, no real logos, no franchise imagery, no generic esports/skull language,
no neon gradients, and no fake alien alphabet.

The useful ideas selected from that study were the broken clock, weary ghost, severed chain,
occluded eye, folded route, cut signal, ledger orbit, custody brackets, drill tooth, pressure mark,
boarding hook, and weld scar. They were redrawn conventionally and tied to live fiction in:

- `src/data/palettes.js` (`PAINT_PROFILES` and `PLAYER_NOSE_ART`)
- `src/data/flavor/030-graffiti.js`
- the canonical faction definitions under `src/data/factions/`

## Integration packet

The next packet must select a small, story-grounded subset for one exact ship family. It must:

1. map chosen cells to existing UVs or authored decal geometry without changing collision/sockets;
2. keep generated imagery out of physical normal/AO/metallic/roughness derivation;
3. KTX2-compress base color and emissive with their correct color-space contract;
4. update exact source/release manifests and runtime selection only while owning those lanes;
5. prove mip safety, alpha/sorting behavior, restrained bloom, texture residency, and cache sharing;
6. capture close, normal-flight, and dense-scene comparisons before visual acceptance.

Do not apply every mark to every hull. A lawful rescue ship, a smuggler, a miner, and a recovered
gang hull should not share one interchangeable decal soup.
