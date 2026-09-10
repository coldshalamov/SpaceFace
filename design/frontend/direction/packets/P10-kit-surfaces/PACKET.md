```yaml
packet: P10
title: Surface kit — plates, windows, legends, stripes, wear, grain (transparent PNG)
lane: IMG
tool: ChatGPT 6 Pro (image generation + scripting VM; Pillow/OpenCV for cutting and alpha)
dependsOn: [P01, P02, P03]
current: [station-market, flight]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/frame-station-market.png, design/frontend/direction/approved/frame-hud-resting.png, design/frontend/direction/approved/crops-bench.png, design/frontend/direction/approved/crops-hud.png]
returns: P10-return.zip
turns: 1 (+1 correction)
```

# P10 — Surface kit: the materials every screen is built from

## Objective

Turn the approved frames' materials into **reusable transparent-PNG assets** that code assembles
with CSS `border-image` (nine-slice) and tiling. This packet produces the *surfaces*; P11 produces
the controls; P12 the instruments. Every asset must be cut from, or rendered to match, the
approved frames exactly (same plate colour, edge light, glass darkness, grain).

## Read

`_COMMON` (all) → `inputs/kit-notes.md` (the hex, thickness and glass values are law) →
`03_CONVENTIONS.md` §2 (raster rules, nine-slice, contact sheet) and §6 (manifest).

## Deliverables (@1x sizes; ship @2x too)

**Plates (nine-slice, corners self-contained, middles stretchable)**

| id | @1x size | slice | Notes |
|---|---|---|---|
| `plate.bench.primary` | 480×320 | ~24 | the main workbench plate: gunmetal, 3 px lit top edge, 1 px under-shadow |
| `plate.bench.raised` | 480×320 | ~24 | one step lighter; for the selected/active plate |
| `plate.bench.sunk` | 480×320 | ~24 | recessed well: darker, inner top shadow; holds rows and readouts |
| `plate.bench.paper` | 480×320 | ~24 | the codex reading insert: cream paper with a machined rim |
| `plate.edge.small` | 240×120 | ~16 | HUD-scale plate: thinner edge, lighter grain |
| `plate.poster.rail` | 64×480 | 16/16/16/16 | the legend rail for POSTER menus (vertical) |
| `plate.legend.strip` | 240×40 | 12/16/12/16 | a backlit legend strip background, unlit |
| `plate.legend.strip-lit` | 240×40 | 12/16/12/16 | the same, lit amber (light baked in) |
| `plate.legend.strip-white` | 240×40 | 12/16/12/16 | lit white (Crucible / wanted) |
| `plate.legend.strip-red` | 240×40 | 12/16/12/16 | lit red (wanted signal) |
| `plate.row.selected` | 480×40 | 8/16/8/16 | the selected-row light: an amber left-edge light with a soft spill |

**Windows (nine-slice)**

| id | @1x | slice | Notes |
|---|---|---|---|
| `window.glass` | 480×320 | ~20 | smoked glass: transparent centre at 45 % darkening, lit rim, faint reflection strip top-left |
| `window.glass.deep` | 480×320 | ~20 | 60 % darkening for text over busy scenes |
| `window.viewport` | 480×320 | ~20 | the hull/scene viewport: 0 % darkening, rim only |

**Tileables (seamless, alpha)**

| id | @1x | Notes |
|---|---|---|
| `tile.grain` | 256×256 | brushed-metal grain overlay, ≤ 6 % opacity effect |
| `tile.hazard.stripe` | 128×32 | safety chevron stripe, chipped, orange/yellow on transparent |
| `tile.hazard.stripe-red` | 128×32 | the wanted variant |
| `tile.edge.light` | 256×8 | the lit top-edge strip for custom-height plates |
| `tile.etch.hairline` | 256×4 | an etched separator line |

**Wear overlays (alpha, placed by code at corners/edges, never over text)**

`wear.corner.01–04` 96×96 · `wear.edge.chip.01–03` 160×24 · `wear.glass.print` 200×140 (a
fingerprint for glass) · `wear.grime.strip` 256×24.

**Contact sheet** `_contact-sheet.png` showing every asset on the ground colour with its id.

## Method (do this, in this order)

1. Extract the exact material values from `kit-notes.md` and the crops. Build a master **material
   swatch** image and compare it to the crops at 100 % before cutting anything.
2. Generate each plate as a large master (≥ 2× the stated size), then cut and downsample in the
   VM. Verify nine-slice behaviour by stretching each plate to 2× width and 3× height in a script
   and inspecting the result.
3. Clean alpha edges; test on white and on magenta.
4. Run every check in `03_CONVENTIONS.md` §7 and record results in `NOTES.md`.

## Acceptance

1. Every asset above exists at @1x and @2x with the manifest slice values; stretch tests pass.
2. Placed side by side with the approved Market and HUD frames at 100 %, the materials are
   indistinguishable in colour, edge light and grain (put that comparison image in `NOTES.md`).
3. No baked text; no gloss; no bevel highlights beyond the single lit top edge; grain subtle.
4. `manifest.json` validates; ids exactly as listed.

## The way this gets faked (reject yourself)

Flat rounded rectangles with a 1 px lighter border and a gradient; plates whose corners smear when
stretched; "glass" that is a gray fill with no rim; hazard stripes that look like a warning-sign
clip-art; wear that is noise sprinkled everywhere.
