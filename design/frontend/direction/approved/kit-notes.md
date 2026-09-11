# kit-notes — the numbers behind the approved frames

Produced 2026-09-10 for **S1 / PQ-194.00**. Everything here was **measured off the produced
renders**, not asserted: where a value differs from the art direction's starting values, the
measurement and the reason are given.

The machine-readable form of all of this is `assets/ui/kit/tokens/tokens.json`, which generates
`tokens.css`. If the two ever disagree, the JSON is right — this file is its prose.

---

## 1. How these frames were made

| Layer | How |
|---|---|
| The world behind every frame | A **Cycles render of the game's own production GLBs** — `kestrel_borrowed_time_v4` (the Kestrel "Hitch"), `place_maintenance_gantry`, `place_worklight_tower`, `place_container_rack`, `place_conveyor_truss`, `place_radiator_bank`, `place_asteroid_rock_a/b/c`, `place_claim_outpost_refinery`, `place_dead_hulk`, `place_sensor_mast`, `place_cargo_pod_standard`, `place_drill_platform`. Scenes: `assets/ui/kit/tools/bl_scenes.py`. |
| Every piece of hardware on the frame | A Cycles render of real modelled geometry through the Field Hardware material library, `assets/ui/kit/tools/bl_common.py` + `bl_kit.py`. Measured thickness, a real relieved edge, real anisotropic brushed grain, real chipped paint, real smoked glass, true alpha. |
| The logotype | The **produced mark** (`assets/ui/kit/marks/logotype/spaceface-logotype.svg`), rasterised into the frame — not a wordmark re-set in a font at compose time. |
| Icons and marks | Hand-written SVG from one construction grammar (`icons.py`, `marks.py`). |
| Type | Real Archivo and Instrument Sans, instanced to the exact axis positions below with fontTools. |
| Composition | An explicit art-direction script (`tools/frame_title.py`, `tools/frame_screens.py`) — deliberately NOT the prototype's own CSS, so the frame stays an independent target and `screens/_compare.html` measures something real. |

**No image-generation model was used.** This harness has no native `image_gen`; third-party
diffusion connectors were present and were deliberately not used, per
`_COMMON/00_READ_ME_FIRST.md`. Every master is reproducible from the committed scripts.

## 2. Faces

| Role | Face | Axes | Tracking | Line height |
|---|---|---|---|---|
| Display / stencil / hero numerals | **Archivo** (SIL OFL) | `wght 900`, `wdth 125` (Expanded). 800 for menu items and hero numerals | +0.02 em | 0.9 |
| Legends, key legends, engraved labels | **Archivo** | `wght 600`, `wdth 62` (Condensed); 500 for the quietest | +0.06 em | 1.0 |
| Body, rows, help, codex | **Instrument Sans** (SIL OFL) | `wght 400`; 500 for emphasis and for all tabular data | 0 | 1.4, measure at most 64 ch |

Both are already vendored in `styles/fonts/` and are shipped with the kit in
`assets/ui/kit/kit/fonts/` with `OFL-Archivo.txt`.

**On the search for a better display face.** The art direction invites one. Archivo was kept,
and the reason is specific rather than inertia: the direction asks for *stencil potential* and a
*width axis*, and Archivo is the only OFL candidate that has both — its 62 to 125 width axis is
what lets one family carry both the 200 px Expanded wordmark and the 11 px Condensed legend
without a second face, which section 11 counts as one voice. The named alternatives were
rejected on that test: **Tektur** and **Chakra Petch** have no width axis and read as sci-fi
display rather than industrial marking (and "sci-fi cliche" is in the guard); **Barlow /
Barlow Condensed** are separate families rather than one axis, and the condensed is too narrow
to hold a lit legend; **Big Shoulders Display** has the width but its terminals are too
calligraphic for painted hull marking. No commercial face is recommended: nothing here is
blocked by the free one.

## 3. Type scale (px at 1920)

`12` fine print · `14` data · `16` body · `20` emphasis · `28` subhead · `40` menu ·
`64` hero numeral · `96` screen title · `140` hero · `200` name.

x0.75 at 1280 with a hard **12 px floor applied per step** (so 12/14/16 all land on 12, not on
9/10.5/12); x1.25 at 2560. Both steps are real media queries in `tokens.css`.

Every screen carries at least one element at 64 px or larger. In these frames: the title
wordmark at 188 px, CRUCIBLE at 160 px, the HUD's speed numeral at 64 px.

## 4. Colour — every hex

| Token | Hex | Note |
|---|---|---|
| ground | `#0C0A08` | warm near-black |
| plate | `#1A1714` | **measured `#20180F`** on the lit face of the produced plate |
| plate-raised | `#26211B` | |
| plate-sunk | `#100E0C` | |
| edge-light | `#F2B950` | the produced relief band peaks at **`#8F7455`** and runs about 5 px wide at @1x |
| under-shadow | `#090605` | **measured** under the produced plate, 2 px |
| bone | `#EAE6DF` | 100 % live · 62 % resting · 38 % tertiary |
| legend | `#FFB347` | renders **`#FFBE4C`** lit and **`#AD782D`** at rest |
| signal | `#F2B950` | |
| hazard | `#FF6A2B` | the UI signal value |
| hazard-paint | `#D9551F` | the **sprayed enamel** the produced chevrons actually use |
| hazard-yellow | `#C79A3C` | the alternating chevron |
| wanted | `#FF4D3D` | |
| cold | `#DDE6FF` | the wanted temperature's backlight |
| good / bad | `#9BD8A0` / `#FF7A6B` | numerals only |
| glass | `#05070A` | at 45 % (deep: 60 %) |
| paper | `#E8DFCE` | the codex insert |

### Two values moved, and why

Both were caught by `tools/contrast.py`, which composites a dimmed colour over its actual plate
rather than checking the colour in isolation:

1. **Resting legends are 45 %, not section 4's 40 %.** At 40 % over a sunk well the measured
   ratio is **2.62:1**, below the programme's own 3:1 UI floor (section 7). 45 % measures
   3.00:1. The floor is not aesthetic and wins.
2. **The edge light is 47 %, not 38 %.** At 38 % against the ground it measures **2.45:1**. A
   plate's lit edge is what distinguishes the plate from the ground, so it is
   component-boundary information. 47 % measures 3.06:1 — a hair over the top of section 7's
   stated 30–45 % band.

All **21** declared text-on-plate pairings now pass:
`python assets/ui/kit/tools/contrast.py`.

## 5. Plate metrics (modelled, so these are literal)

1 Blender unit = 1 design pixel at @1x.

| Value | Number |
|---|---|
| thickness | 7 px (keys 8, HUD-scale plates 5) |
| relieved edge width | 3.4 px (the lit band's full projected width) |
| edge lift | 1.3 px |
| lit top edge, as read | about 3 px at @1x |
| under-shadow | 2 px |
| corner radius | 4 px (2 px on small parts) |
| signature cut angle | one 45-degree cut, 30 px, top-right, **primary plates only** |
| brushed grain | roughness +/- 0.10, stretched 26:1 along X; effective opacity at most 6 % |
| smoked glass | 45 % darkening (deep 60 %), lit rim, one reflection strip light-linked to the pane only |
| wear | at most 8 % of any surface; never over text |
| nine-slice inset | 24 px (bench plates) · 16 px (edge/rail) · 18 px (keys) · 20 px (windows) |

**Why the edge is a relief rather than a chamfer.** From a top-down orthographic camera a
45-degree chamfer of width *c* only projects to *c*/sqrt(2) pixels, so a chamfer wide enough to
read would have to be wider than the plate is thick — and a Bevel modifier wider than half the
thickness collapses the solid. The top face is instead inset by 3.4 px and stands 1.3 px proud,
leaving an approximately 20-degree ring that projects to its full width. Under the grazing key
the +Y arc of that ring is the lit top edge and the -Y arc is the shadow under.

## 6. Icon construction

Grid 24 with a 2 px safe margin, 1.5 px minimum feature, corner radius 2, **one** stroke detail
at 1.75 px. Filled silhouette first; the detail is a cut or an inner line, never an outline of
the whole glyph. The 32 and 48 masters are real optical sizes — the detail goes to 2.20 and
3.00 px rather than scaling linearly, because a 1.75 px cut at 48 would read as a gash.
Standalone marks (close, plus, minus, check, the chevrons) carry 3.0 px, because there the form
*is* the glyph.

Mirror pairs differ by a second, non-directional channel: **Well** has a filled centre and a
closed ring, **Repel** a hollow centre and a broken one. Direction alone is unreadable at the
21–32 px the radar and the rows actually use.

`currentColor` throughout, with one optional `accent` path per glyph where the amber light sits.

## 7. Per frame — composition, and the reading order

### Title v1 "Hangar"
The hull in its rig: gantries front and back, a worklight tower, container racks in the depth,
a floor with real contact shadows, and a cold bay aperture cut in the hangar wall at the top
left. Warm practicals, one cold rim.
**Reads:** the wordmark, then the hull in its rig, then the lit menu item, then the rest of the
menu. The gantry in the near foreground gives the depth the register asks for.

### Title v2 "Field at dusk" — **the pick**
The hull seated on an asteroid pad at dusk with real contact, a sensor mast and a worklight
tower as the field site, a refinery on the horizon, the sky going cold above the warm band.
**Reads:** the wordmark, then the hull on the rock, then the lit menu item, then the horizon.
Rock carries the whole lower half — the one material the owner has ever praised.

### Title v3 "Bay door"
Inside the bay looking past the hull out through the open door: heavy jambs and a lintel close
to the lens, the hull mid-ground, a refinery and a dead hulk far outside.
**Reads:** the wordmark, then out through the door, then the menu.

### Crucible door
Ricochet Foundry as a lit set at Crucible temperature (white-hot): hard banks of truss and rack,
conveyor lines, forge glow from below and behind, the player's build in the lower right.
The three selector rows sit in one smoked window so their text keeps its contrast over a
forge-lit arena — a CSS scrim there would be exactly the material-faking the programme rejects.
**Reads:** CRUCIBLE, then the arena, then the Launch key, then the selected tiles.

### HUD resting / HUD wanted
EDGE: instruments pinned to the edges over the chase camera's own view of the Kestrel. Nothing
but the reticle and the world tag in the middle third; no plate larger than one sixth of the
frame; legends at 45 % at rest.
**Wanted changes the whole frame**: the plate's channels cool, every backlight goes cold
white-blue, the sector-law strip flips to WANTED on live safety paint, the radar face cools and
its contacts turn hostile, the segmented bars go cold. One hazard element, lit, not flashing.

## 8. Motion and sound

Numbers and cue table: `assets/ui/kit/kit/MOTION_SPEC.md` and `SOUND_SPEC.md`. Both are driven
from the same tokens, and both treat reduced motion and the muted default as floors.
