# Field Hardware — the kit

Produced by **S1 / PQ-194.00**, 2026-09-10. This directory is the asset half of the Field
Hardware programme: the surfaces, controls, instruments, icons, marks, tokens, motion and sound
that every SpaceFace screen is assembled from, plus a kit page and three runnable hero screens
that prove the assembly.

The frames these were built to match are in
[`design/frontend/direction/approved/`](../../../design/frontend/direction/approved/), and the
frames outrank this and every other document.

---

## Look at it first

Everything opens from `file://` — classic `<script>` tags, relative paths, no `fetch`.

| Open | What it is |
|---|---|
| `kit/index.html` | every component, rendered from the produced assets, with the game's own strings |
| `screens/title.html` (`?v=1\|2\|3`) | the title screen, POSTER register |
| `screens/crucible-door.html` | the Crucible door, POSTER at the white-hot temperature |
| `screens/hud.html` (`?state=wanted`) | the flight HUD, EDGE register, both temperatures |
| `screens/_compare.html` | the approved frame laid over the live prototype — overlay, wipe, or difference |
| `kit/demo-motion.html` | every motion per register, with a reduced-motion switch and a frame-cost readout |
| `kit/demo-sound.html` | all fourteen cues, played through the game's own recipe shape |

`python serve.py` serves the same thing over http if devtools are easier that way. Nothing
depends on it.

## What is in here

```
tokens/     tokens.json  →  tokens.css      colour, type scale, spacing, plate metrics, motion
assets/     the produced rasters, @1x and @2x, with a _contact-sheet.png per folder
            plates/ windows/ tiles/ keys/ controls/ lights/ gauges/ radar/ sockets/
            badges/ tapes/ strips/ wear/  and  svg/ for everything that moves
icons/      86 glyphs × 24/32/48, three sprites, glyph-paths.json, two sheets
marks/      the SPACEFACE logotype (3 lockups), 14 faction crests, mode/arena marks,
            difficulty insignia, system marks, a sprite and two sheets
kit/        fh.css (the component layer) · fh.js · motion.js/.css · sound.js · the specs
            · the demos · the shipped fonts
screens/    the three hero prototypes, the comparer, and fixtures.js (every string as data)
tools/      everything that produced all of the above, and every check that graded it
kit-manifest.json   the machine-readable inventory (03_CONVENTIONS.md §6)
```

## How it was made

Every raster is a **Blender 5.1 Cycles render of real modelled geometry** — measured thickness,
a real relieved edge lit by a real grazing key, real anisotropic brushed grain, real chipped
paint, real smoked glass, true alpha. No image-generation model was used; see
`approved/DECISIONS.md` for why, and `approved/kit-notes.md` for every measured number.

The world behind each frame is a lit shot of the **game's own production GLBs**.

Icons and marks are SVG emitted from a construction grammar, so no glyph can drift out of the
family. Type is the real OFL variable fonts, instanced to the exact axis positions.

## If you are S2, or the engine port

- **Build on `kit/fh.css`.** Its class index is at the top of the file and the names are stable.
  `tokens.css` is generated from `tokens.json` — edit the JSON and re-run
  `tools/build_tokens_css.py`, never the CSS.
- **`fh.css` contains no `linear-gradient`, no `box-shadow` and no `border:` used as material,**
  and it must stay that way: the programme's asset-coverage grep is the acceptance gate for any
  screen built on it.
- **Adding an asset** is a builder function plus one line in `tools/bl_kit.py`'s registry; the
  sheet machinery lays it out, renders it, cuts it at @1x and @2x, manifests it, and runs the
  alpha, registration and stretch checks.
- **Changing only metadata** (a slice inset, a state list) costs no render:
  `blender … bl_kit.py -- <sheet> render=0` rewrites the layout, then `tools/cut_kit.py`.
- **`tools/measure_delta.py`** tells you in pixels how far a prototype is from its frame. It is
  the cheapest way to know whether a port actually matched.

## The checks

```
python tools/contrast.py                     # 21 text-on-plate pairings vs the WCAG floor
python tools/alpha_check.py assets           # fringe on white and on magenta
python tools/cut_kit.py                      # cut + manifest + registration + stretch + sheets
node   tools/shoot_screens.mjs               # every page from file://, fails on any console error
node   tools/validate_sound.mjs              # plays all 14 cues in a real AudioContext
python tools/measure_delta.py                # frame vs prototype, in pixels
```

## Floors this kit is built to keep

12 px minimum text including canvas; WCAG AA contrast (proven, not asserted); reduced motion as
a **cut**; forced colours (every icon and mark is inline SVG on `currentColor`); keyboard reach
with a visible focus ring proven at 15.49:1 on the darkest plate and 12.83:1 on the lightest;
no idle `requestAnimationFrame` and no looping animation; no `backdrop-filter`; colour literals
as tokens. These are not style choices and a later pass must not clean them up with the skin.
