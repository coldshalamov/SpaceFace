# LANE E — DECAL / TRIM / MASK TEXTURE GENERATORS (deterministic Python + PIL)

Read `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/briefs/common.md` first and
obey it. You build the 2D surface vocabulary: decal atlas, trim sheet, and wear-mask
library that the material/variant lanes composite onto ships. Python 3.14 + Pillow 12.2
(`python`). Everything seeded and byte-deterministic (set PYTHONHASHSEED not required —
just never iterate sets/dicts of floats; use explicit lists and `random.Random(seed)`).
Strip all timestamps from PNG output (save with `pnginfo=None`, no time chunks — verify by
hashing two runs).

## Deliverables (scripts in `tools/foundry/texgen/`, outputs in `assets/ships/foundry/fleet_breadth_20260720/textures/`)

### 1. `decal_atlas.py` → `decals_atlas.png` (2048×2048 RGBA) + `decals_atlas.json`

White-on-transparent stencil marks, drawn from geometric strokes (rects, arcs, polygons)
— NO font rendering (no truetype dependence; glyphs are constructed, which also makes them
look like industrial stencils). Grid-packed with 8 px gutters; JSON lists every decal's
`{name, x, y, w, h}` in pixels.

Content required:
- **Stencil digit set 0–9 and A–Z** — single-weight industrial stencil (bridged counters
  like real stencils), one cell each (used to compose registration codes at runtime/bake).
- **Warning group:** hazard chevron strip, hazard stripe block (45°), NO-STEP bar frame,
  intake-danger triangle, radiation trefoil (geometric), high-voltage bolt.
- **Service group:** fuel port ring-label, umbilical socket frame, tow-point corner brackets,
  lift-here arrows (4 rotations), inspection tag rectangle with punch hole, panel-number
  labelframe (empty box with header band).
- **Faction glyph set (8):** simple 2-3 stroke emblems readable at 24 px:
  scn = shield chevron over bar · mts = three nested arcs (coin) · dmc = pick-and-gear
  hexagon · reach = jagged claw slash · quiet = broken circle (gap at top) · vael = three
  radiating curved spines · free = open triangle with tail · choir = tall lancet arch with
  halo dot. Keep them abstract-geometric, no letterforms.
- **Wear group:** kill-mark tally strip, patch outline (irregular pentagon), weld-repair
  ring, scorch ring (soft alpha), 3 different paint-chip cluster stamps.

### 2. `trim_sheet.py` → `trim_basecolor.png`, `trim_normal.png`, `trim_orm.png` (1024×1024)

Horizontal bands (a classic trim sheet), each band a different construction feature:
panel gap with shadow line · double panel gap with fastener row · louvered vent run ·
raised rail with center bevel · recessed channel with drainage holes · hatch frame edge ·
weld bead lap · ribbed radiator fins · tread/grip plate · blank brushed band.
Author a 16-bit height model internally, then derive:
- **normal**: Sobel gradients → tangent-space normal, **OpenGL/glTF +Y-up green convention**
  (R = +X right, G = +Y UP, B = out). Normalize properly; edges of bands must not wrap
  unless the band tiles horizontally (make every band tile horizontally).
- **orm**: R = AO (from height cavity, blurred), G = roughness (vary per band: machined
  bands 0.3–0.45, painted 0.5–0.6, rubber/grip 0.85), B = metalness (bands are metal 1.0
  except painted bands 0.0).
- **basecolor**: neutral grays per band (paint bands 0.24–0.27 neutral for runtime tinting,
  bare-metal bands 0.40–0.48 with subtle brushed streaks).
Include `trim_sheet.json` documenting each band's v-range and intended use.

### 3. `grime_masks.py` → 8 grayscale masks 1024×1024 (L mode)

Each mask a DIFFERENT physical process at a DIFFERENT scale (no shared noise recipe):
1. `mask_edgewear` — bright at panel edges/corners (generate from a synthetic panel-grid
   distance field, tight 2–6 px falloff).
2. `mask_recessdust` — dark-crevice accumulation (inverse cavity of the same grid, wide
   soft falloff).
3. `mask_streaking` — directional drips from seeded anchor points, long tapered streaks.
4. `mask_heatradial` — radial scorch gradient with banding rings, off-center.
5. `mask_chips` — sparse hard-edged chip clusters concentrated near edges (Poisson-ish
   seeded scatter, clustered, NOT uniform).
6. `mask_corrosion` — blotchy speckle grown around seed points (cellular growth look).
7. `mask_carbon` — soft directional soot wedge (for engine/weapon roots).
8. `mask_panelfade` — per-panel random value offsets (each grid cell one flat value —
   simulates mismatched repainted panels; this one reads at ANY distance).
Different characteristic scales are mandatory: document each mask's feature size in px in
`grime_masks.json`.

### 4. `check_texgen.py`

Runs all three generators twice into temp dirs → asserts byte-identical outputs, expected
dimensions/modes, atlas JSON rect validity (in-bounds, no overlaps), normal-map
normalization (mean |vec length − 1| < 0.02, mean green ≥ 0.5 where slopes point up),
mask value coverage (each mask uses ≥ 20% of the value range; no mask is >60% pure black
or pure white). Prints `TEXGEN_CHECK_OK` and writes `check_texgen_report.json`.

Run: `python tools/foundry/texgen/check_texgen.py` from the worktree root — exit 0 required.

Do not stop early; debug until the check is green. Also render a human contact sheet
`textures/texgen_contact_sheet.png` (all outputs tiled with labels drawn as stencil glyphs
from your own atlas). Finish per common protocol (report: `reports/E-TEXGEN-REPORT.md`).
