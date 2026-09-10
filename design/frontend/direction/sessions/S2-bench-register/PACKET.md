```yaml
session: S2
title: The bench register — station, THE SHIP, chart, settings, load as frames and prototypes; keyart; 3D drafts
tool: ChatGPT 6 Pro — image generation + SVG + Python/JS + procedural 3D in the VM
dependsOn: [S1]
phases: [P03, P04, P15, P16]
current: [station-dock, station-market, station-shipworks, station-ledger, station-contracts, station-factions, station-industry, station-bar, ship, chart-galaxy, chart, settings, save-load, new-game]
inputs: [.devshots/ui-packets/returns/S1-return/, node_modules/three/build/three.module.js, node_modules/three/build/three.core.js, node_modules/three/examples/jsm/loaders/GLTFLoader.js, node_modules/three/examples/jsm/controls/OrbitControls.js]
returns: S2-return.zip
```

# S2 — The bench register

## What this session is

S1 decided the look and built the kit; S2 builds the game's **working screens** — the docked
station, THE SHIP, the chart, settings, load — as frames first and then as HTML prototypes on the
S1 kit, produces the picture assets those screens need, and drafts the **3D sets** the game's
stage will stand on. The BENCH register (instruments on a workbench with the live world through
smoked-glass windows) is the hardest register to get right: dense data must stay an instrument,
not a spreadsheet.

`inputs/S1-return/` is the S1 return (attached as `S1-return.zip` — unzip it there): `kit-notes.md`,
`tokens/`, `kit/fh.css`, the assets, icons and marks. **Match them exactly.** Extend the kit; do
not fork it. Append new components to `fh.css` under a `/* S2 */` banner and new tokens under
`/* S2 */`.

**If the controller has not reviewed S1 yet** (no `DECISIONS.md` in the return), proceed anyway:
the kit is independent of which title shot gets picked, so nothing in this session waits on that
choice. Treat S1's `NOTES.md` `MISSING` list as your Phase 1a, and do not re-open S1's decisions
unless its `QA.md` flags a defect that blocks a bench screen — then fix it in place, under a
`/* S2 fix */` banner, and say so in `NOTES.md`.

Ground rules are S1's: plan first, checkpoint after every phase, never stop to ask, masters then
scripts, real strings, `file://`-openable prototypes, and **images only from the native `image_gen`
tool (GPT Image 2.5) — never Adobe or another connector**. You have the web: the Three.js files in
`inputs/` are a convenience (you may install or fetch libraries yourself), and the reference study
rule applies to the bench screens too (station and garage interfaces, instrument panels, industrial
product photography).

## Phases

### Phase 0 — Set up

Read `inputs/S1-return/NOTES.md` and `QA.md` first: anything S1 listed under `MISSING` that a
BENCH screen needs is your Phase 1a. Skeleton, `PLAN.md`, `PROGRESS.md`; copy S1's `tools/`.

### Phase 1 — Frames (image generation) — specs `phases/P03.md`, `phases/P04.md`

Six frames: **docking arrival** (POSTER, docked temperature), **the Market**, **THE SHIP**, **the
chart (galaxy scope)**, **Settings**, **Load** — with plates, layers where possible, crop sheets
(engraved row rest/selected, filter key, gauge, stepper, primary key, window edge, leader socket,
toggle both states, slider, key-bind cell, lens key, sector mark, beacon mark), and `kit-notes.md`
**appended** (never rewritten) with the BENCH values: row height, twelve-row table metrics, window
darkening over a busy berth, the paper insert if you introduce it early. Checkpoint.

### Phase 2 — Assets for the bench (image generation + Python + SVG)

The delta the BENCH screens need beyond S1: the small dial set for THE SHIP (bezel, face, needle
SVG, scale SVG), engraved row plates and column-header strips, the etched price-trace window, the
stepper well, the sector marks and lane/pin geometry for the chart (SVG), the chart's field plates
(three nebula/dust plates, tileable star layers at two depths), the lens-key group bracket, the
inspector plate. Then **keyart** — spec `phases/P15.md`: five arena tiles, five mode tiles, four
difficulty tiles, three backdrop plates with cold variants — same lens, same grade, opaque plus
masked. Contact sheets, manifest entries. Checkpoint.

### Phase 3 — Prototypes on the kit (code)

`screens/station-dock.html` (arrival, with the destinations as backlit keys and UNDOCK's readiness
light), `station-market.html`, `station-ledger.html`, `station-contracts.html`,
`station-factions.html`, `station-industry.html`, `station-bar.html`, `station-shipworks.html`,
`ship.html`, `chart.html`, `settings.html`, `load.html`. All on `fh.css` + your `/* S2 */`
additions, with `fixtures.js` holding the dossier's strings and enough invented-but-plausible rows
to fill every table (twelve commodities, six contracts, six saves, eight sectors). The chart's
field is **drawn** (canvas 2D or SVG): sectors as lit star systems, lanes as etched lines, the
beacon as the one amber signal, pan and zoom working. THE SHIP's hull is the S1 plate or a
rendered still with the hardpoint leaders pinned by coordinates. Every screen: keyboard
navigation, focus ring, the P17 reveal, sounds on focus/confirm/deny, the docked temperature. Add
each to `_compare.html`. Checkpoint.

### Phase 4 — 3D drafts (procedural GLB + Blender scripts) — spec `phases/P16.md`

Two kinds of output, clearly separated in `NOTES.md`:

1. **Procedural drafts you can finish in the VM** (Python: `trimesh`/`numpy`, textures from your
   own generated sheets, export GLB with `pygltflib` or trimesh): a keycap master, a gauge bezel
   master, a socket well, a gantry module, a floor plate with markings, a work-light fixture, a
   cable run, a bay-door frame. Scale 1 unit = 1 m, +Y up, named nodes and materials, PBR
   textures at power-of-two sizes. These are for consistent renders of UI props and for blocking
   out the sets.
2. **Blender scripts for the local lane** (`blender/build_hangar.py`, `build_berth.py`,
   `build_arena_foundry.py`, `render_review.py`): `bpy` scripts that build each set to the
   approved plates' composition (camera, lighting, materials named for the repository's
   material-truth standard) and render the review still from the frame's camera. Write them to run
   headless (`blender -b -P`). You cannot run Blender here; write them carefully and say so.

A **preview page** `preview/index.html` (Three.js from `inputs/` via an import map; this one page
needs `serve.py`) that loads each draft GLB with orbit controls under the kit's lighting so the
controller can look at them. Checkpoint.

### Phase 5 — Self-review and package

Conventions §7 checks; the two tests and the guard on every frame and prototype; `QA.md`; final zip.

## Return contract

```
S2-return/
  PLAN.md · PROGRESS.md · NOTES.md · QA.md · manifest.json
  frames/ plates/ layers/ crops/ kit-notes.md (S1's + appended S2 section)
  assets/ (delta only, same folder scheme as S1) · tiles/ (arena, mode, difficulty) · plates/backdrops/
  kit/ fh.css (S1's with the /* S2 */ additions) · tokens.css (same)
  screens/ station-*.html · ship.html · chart.html · settings.html · load.html · fixtures.js · _compare.html
  3d/ drafts/*.glb · textures/ · blender/*.py · preview/index.html · PROVENANCE.md
  tools/ · serve.py
```

## Definition of done

Six frames passing the two tests; the twelve prototypes open from `file://`, match their frames in
`_compare.html`, and show twelve table rows at 1280 without crushing; the Market reads as an
instrument with three enormous elements and the table at ≤ half width; the chart's field is drawn
with depth and the bench never covers its centre; every list of things is imaged tiles; draft GLBs
load in the preview; Blender scripts are complete and documented; `NOTES.md` separates "finished
here" from "for the local Blender lane".

## What the next session consumes

S3 builds the remaining screens and the whole-app prototype on your `fh.css`; keep the class
documentation at the top of the file current.

## The way this session gets faked

A market that is a full-width table; a chart that is the S1 plate with pins on top; twelve
prototypes that share one silhouette; GLBs that are boxes with names; Blender scripts that were
never read back.
