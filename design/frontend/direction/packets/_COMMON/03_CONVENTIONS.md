# Delivery conventions — formats, names, manifests, quality checks

These rules apply to every packet. A packet's own file may tighten them, never loosen them.

---

## 1. Return contract (every packet)

Return **one zip** named `<PACKET-ID>-return.zip` (for example `P10-return.zip`) containing:

```
<PACKET-ID>-return/
  manifest.json          ← machine-readable inventory (schema §6)
  NOTES.md               ← what you made, what you could not make, decisions, open questions
  <deliverables as the packet lists them>
```

Secure the zip before writing any narration. If the turn is running out, package what exists and
say what is missing in `NOTES.md`. Never substitute a description for a file. Never invent a file
you did not produce. If a capability is unavailable (image generation, a font, a tool), say so in
`NOTES.md` under `BLOCKED` and deliver everything else.

## 2. Raster assets (transparent PNG)

- Generator: per `00_READ_ME_FIRST.md`'s production law — manufactured surfaces from the
  repository's Blender kit harness, world plates from the game's own GLB scenes, mood imagery
  (keyart, backdrops, fields) from the running harness's **native `image_gen` tool** (ChatGPT's
  is GPT Image 2.5; Codex's built-in is the same family). `manifest.json` → `tools` names the
  tool per class; a return whose masters came from a third-party connector, a silent substitute,
  recovered/upscaled art, or flat script-drawn fills fails acceptance, however good they look.
- Format: **PNG-32 with real alpha**. No matting to black or white; edges must be premultiplied
  cleanly (verify by placing the asset on a pure white and on a pure magenta ground and confirming
  no fringe).
- Deliver **@2x** (native) and **@1x** (downsampled with a high-quality filter). Name
  `name@2x.png` and `name.png`. The @1x pixel size is the size stated in the packet.
- Colour: sRGB, 8-bit per channel. No embedded colour profile surprises; strip ICC if unsure.
- Background: when a packet asks for a **plate** or **tile** that is meant to be opaque, deliver it
  opaque *and* deliver a second alpha-masked version if the packet lists one.
- Nine-slice assets: deliver the whole plate plus the four slice insets in the manifest
  (`slice: {top, right, bottom, left}` in @1x pixels). Corners must be self-contained; the
  stretchable middle must be truly stretchable (no pattern that breaks when scaled).
- Sprite sets (states): deliver each state as its own file (`key-rest.png`, `key-hover.png`,
  `key-pressed.png`, `key-disabled.png`, `key-primary.png`); identical pixel dimensions and
  registration across states.
- No text baked into raster assets unless the packet asks for it (legends are set live in the
  font). Where a packet asks for engraved sample text for a style frame, that is a frame, not an
  asset.
- Every raster set ships with one **contact sheet** (`_contact-sheet.png`) showing every asset at
  @1x on the ground colour, labelled with filenames.

## 3. Vector assets (SVG)

- One file per glyph or mark, plus one **sprite** (`_sprite.svg` with `<symbol id="…">` per glyph).
- `viewBox="0 0 24 24"` for the icon family (32 and 48 masters also `0 0 32 32` / `0 0 48 48`).
  Marks and crests use `0 0 240 240`.
- Fills use `currentColor`; the accent slot uses the literal class `accent` (`fill="currentColor"
  class="accent"`) so code can recolour it. No embedded raster, no `<filter>`, no `<style>` blocks,
  no external references, no `id` collisions, no stroke scaling surprises (`vector-effect` not
  required if strokes are converted to outlines — prefer outlines).
- Optimised (no editor metadata), each icon under 4 KB, each crest under 20 KB.
- Ship a **rendered sheet** (`_sheet.png`) of the whole family at 24, 32 and 48 px on the ground
  colour, and at 24 px in pure black on white (forced-colours check).

## 4. Style frames

- 1920×1080, PNG, sRGB. Also a 1280×720 crop-or-rescale check only if the packet asks.
- Two files per frame: the **composite** (`frame-<screen>[-v<n>].png`) and the **UI layer alone
  on transparent** (`layer-<screen>[-v<n>].png`); plus the **plate** (the world/scene without UI,
  `plate-<screen>[-v<n>].png`) when the scene was generated rather than described.
- Use the exact live strings from `01_GAME_DOSSIER.md` §4 for the screen. Do not invent menu
  items, numbers or names. Placeholder numbers are allowed only where the dossier gives none.
- Fonts: name every face in `kit-notes.md`. The game is a packaged desktop app that bundles its
  fonts, so a face qualifies only if its licence allows bundling in a shipped game (SIL OFL,
  Apache, the Fontshare free licence, or a purchased app licence). Search the web for the best
  such face; the files in `inputs/` are a baseline, not a limit. Deliver the font files and their
  licence with the kit. You may recommend a commercial face for the owner to buy, with a
  rationale, while delivering with the best free alternative. If your image tool cannot render an
  exact face, approximate it and *say which face is intended*.
- Every frame ships with `kit-notes.md`: the faces and sizes used, the hex values of every colour,
  the plate thickness / edge-light / glass values, the icon style rules, and a short paragraph per
  frame on the composition decisions and what the eye should land on first, second, third.
- **A frame is an independent target.** It is composed by an image master or a purpose-built
  composition script — never a capture of the prototype it will later be compared against. A
  `_compare.html` whose two sides are the same renderer measures nothing.

## 5. 3D and Blender deliverables

- Blender source (`.blend`, Blender 4.x) plus glTF/GLB export; textures as PNG/KTX2-ready PNG at
  power-of-two sizes; scale 1 unit = 1 metre; +Y up in the export; named objects and materials.
- Render harnesses as Python scripts with the exact camera, lighting and output settings so a
  render is reproducible.
- Provenance: model/tool versions and every third-party input with its licence.

## 6. `manifest.json` schema

```json
{
  "packet": "P10",
  "returned": "2026-09-12",
  "producer": "ChatGPT 6 Pro | Codex | agent name",
  "tools": ["image_gen (GPT Image 2.5)", "Python 3.x Pillow", "hand-written SVG"],
  "license": "All original work; OFL fonts named in kit-notes.md",
  "assets": [
    {
      "id": "plate.bench.primary",
      "file": "plates/plate-bench-primary.png",
      "file2x": "plates/plate-bench-primary@2x.png",
      "kind": "9slice | sprite | tile | icon | mark | frame | layer | plate | glb | blend | script",
      "size": [480, 320],
      "slice": { "top": 24, "right": 24, "bottom": 28, "left": 24 },
      "states": ["rest", "hover", "pressed", "disabled", "primary"],
      "notes": "short"
    }
  ],
  "blocked": [],
  "questions": []
}
```

`id` uses dot-namespaces the code will reference (`plate.*`, `key.*`, `gauge.*`, `icon.*`,
`mark.*`, `tile.*`, `frame.*`). Keep ids stable across returns.

`blocked` is not decoration: list every required tool or input that was unavailable, with the
exact request that could not be run. A `QA.md` may not record PASS for a deliverable class whose
required tool was substituted — that combination is an automatic reject.

## 7. Quality checks before you package (write the results into NOTES.md)

1. Alpha fringe check on white and on magenta.
2. Registration check: state sprites overlay exactly.
3. Nine-slice stretch check at 2× width and 3× height.
4. Forced-colours check: icons rendered in pure black on white are still recognisable.
5. Size check: every asset at the stated @1x size; nothing over 2 MB except plates and frames.
6. Family check: lay every icon/mark on one sheet — same stroke weight, corner logic, optical
   size; remove any that does not belong.
7. Text check: no baked text where the packet forbids it; exact live strings where frames need
   them.
8. Anti-pattern check against `02_ART_DIRECTION.md` §5 — cockpit, skeuomorph, sci-fi cliché, web
   page, empty, gray, noisy.
9. The two tests (`02_ART_DIRECTION.md` §2).
10. Icon legibility check: render the family unlabeled and name each glyph from its silhouette.
    A glyph nobody can name fails. Two glyphs may never share a silhouette unless they are a
    documented mirror pair (e.g. Well/Repel) differing by a second, non-directional channel —
    "the same hexagon with the dot moved" is a failed family, not a construction grammar.
11. Tile legibility check: every tile's art is authored *for* the tile (keyart or emblem at the
    tile's own composition), never an arbitrary crop of a larger scene; every tile must read
    inside its smallest presentation (the 160 px smoked window for Crucible tiles).
12. Composition check at 100 %: no clipped or wrapped text, no elements overlapping that the
    layout did not intend (a hazard stripe running through a word, a caption colliding with a
    legend), and no control rendered empty where the packet says it is populated (an empty
    socket that should hold a glyph, a blank gauge).

## 8. Naming

Lowercase, hyphenated, no spaces: `key-primary-hover@2x.png`, `icon-verb-tow.svg`,
`tile-arena-ricochet-foundry.png`, `frame-title-v2.png`. Directory per kind: `plates/`, `keys/`,
`gauges/`, `icons/`, `marks/`, `tiles/`, `frames/`, `layers/`, `blend/`, `scripts/`.
