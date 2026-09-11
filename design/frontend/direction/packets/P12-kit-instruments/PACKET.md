```yaml
packet: P12
title: Instrument kit — gauges, bars, radar face, sockets, badges, tapes, reticle (PNG + SVG)
lane: IMG
tool: local Codex (gpt-6-astra xhigh — the Blender kit harness + hand-written SVG for geometry) — or ChatGPT 6 Pro native image_gen + VM from the zip
dependsOn: [P02, P03, P10]
current: [flight, power-rail, ship]
inputs: [design/frontend/direction/approved/kit-notes.md, design/frontend/direction/approved/frame-hud-resting.png, design/frontend/direction/approved/frame-hud-wanted.png, design/frontend/direction/approved/crops-hud.png, design/frontend/direction/approved/frame-ship.png]
returns: P12-return.zip
turns: 1 (+1 correction)
```

# P12 — Instrument kit: the HUD and THE SHIP are built from these

## Objective

The instruments of the EDGE register and THE SHIP's dials, as assets: fixed-size bezels and faces
as transparent PNG, and every *moving or data-driven* part (needles, ticks, sweeps, ring scales)
as **SVG geometry** so code can rotate, mask and animate it without re-rasterising.

## Read

`_COMMON` → `inputs/` (the HUD frames and crops; `kit-notes.md` gauge geometry) →
`03_CONVENTIONS.md` §2–§3.

## Deliverables (@1x; PNG also @2x; SVG single)

| Instrument | Files |
|---|---|
| **Speed gauge** | `gauge.speed.bezel` PNG 360×200 (the arc bezel with etched ticks baked); `gauge.speed.face` PNG (the smoked window behind the numeral); `gauge-speed-needle.svg` (needle geometry centred on its pivot, pivot at `0,0`); `gauge-speed-ticks.svg` (the tick ring as paths, for lit-tick overlays); `gauge.speed.lit-arc` PNG (the amber lit arc segment, masked by code) |
| **Segmented bar** (energy, drive, heat) | `bar.seg.bezel` PNG nine-slice 240×28; `bar.seg.on` / `bar.seg.off` / `bar.seg.hot` / `bar.seg.cold` PNG 12×16 segments (tileable horizontally with a 2 px gap baked in) |
| **Radar** | `radar.bezel` PNG 320×320 (etched bezel, N mark unlit); `radar.face` PNG 320×320 (smoked glass face with vignette); `radar.n-lit` PNG (the lit N only); `radar-rings.svg` (range rings and cardinal ticks as paths); `radar-sweep.svg` (the sweep wedge with a gradient stop list code can recolour); `radar.wanted-face` PNG (the cold variant) |
| **Contact glyphs for the radar** | `radar-glyphs.svg` — twelve class glyphs as `<symbol>`s at 16 px: you · fighter · freighter · miner · patrol · pirate · derelict · wreck · station · gate · beacon · asteroid — filled forms readable at 10 px; plus `radar-glyph-paths.json` (name → SVG path strings) so the canvas radar can draw them with `Path2D` |
| **Sockets** (the action bar) | `socket.rest` / `socket.lit` / `socket.cooling` / `socket.locked` / `socket.empty` PNG 56×56; `socket-cooldown-ring.svg` (a ring code can animate with stroke-dashoffset); `socket.bracket` PNG nine-slice 240×72 (the etched group bracket with a legend slot) |
| **Objective plate** | `plate.objective` PNG nine-slice 320×72 with a lit chevron slot; `objective-chevron.svg` |
| **Sector-law badge** | `badge.law` PNG 280×96: a crest well (empty, 48 px), a strip slot for safety paint, two legend slots; `badge.law.wanted` (cold variant with live red stripe) |
| **Comms tape** | `tape.cap.left` / `tape.cap.right` PNG 16×24; `tape.mid` PNG tileable 64×24; `tape.mid-lit` |
| **Status strip** | `strip.status.bezel` PNG nine-slice 240×20 (ten light wells) |
| **Reticle set** | `reticle-rest.svg` · `reticle-lock.svg` · `reticle-lead-pip.svg` · `reticle-pro-tick.svg` — etched, thin, `currentColor` |
| **Damage wedges** | `damage-wedge.svg` (one wedge, code rotates) |
| **Dials for THE SHIP** | `dial.small.bezel` PNG 88×88; `dial-small-needle.svg`; `dial-small-scale.svg`; `dial.small.face` PNG |
| **World tag** | `tag.world` PNG nine-slice 120×24 with a leader stub; `tag-leader.svg` |

Plus `_contact-sheet.png` and, for every SVG, a rendered PNG preview at 100 %.

## Acceptance

1. Every file above; SVG pivots and viewBoxes documented in `manifest.json` (`pivot: [x, y]`,
   `viewBox`), so a needle rotates about the right point.
2. Composited by script over the approved HUD frame, the assets reproduce the frame's instruments
   at 100 % (put the composite in `NOTES.md`).
3. Radar glyphs remain distinct at 10 px and in pure black on white.
4. Nothing bakes numbers or legends; all text is set live.

## The way this gets faked

A gauge that is a circle with a border; needles baked into the bezel; a radar that is a green
circle; glyphs that are arrows in different directions (direction alone is not enough contrast).
