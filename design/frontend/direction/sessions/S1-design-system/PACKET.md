```yaml
session: S1
title: The design system — frames, tokens, kits, icons, marks, motion, sound, and the hero screens as prototypes
tool: ChatGPT 6 Pro — image generation + hand-written SVG + Python/JS in the VM
dependsOn: []
phases: [P01, P02, P10, P11, P12, P13, P14, P17]
current: [title, crucible-door, flight, station-dock, ship, station-market, chart-galaxy]
inputs: [styles/fonts/archivo-var-latin-standard-normal.woff2, styles/fonts/instrument-sans-var.woff2, styles/fonts/OFL-Archivo.txt, src/ui/station/icons.js, src/ui/glyphs.js, src/ui/kit/motion.js, src/ui/kit/sound.js, src/data/audioRecipes.js, src/audio/synth.js, assets/ui/orbital/brand.svg, assets/ui/command-deck-refit/crucible-mark.svg]
returns: S1-return.zip
```

# S1 — The design system

## What this session is

The founding sprint of SpaceFace's new interface. You are the design lead and the first
front-end engineer at once: you decide what the screens look like by **rendering them**, you turn
those renders into a **complete asset kit**, and you prove the kit by **building the three hero
screens with it** so they open in a browser and match your own frames. Everything later in the
program — four more sessions and the engine port — is built from what you return here.

Read `_COMMON/00_READ_ME_FIRST.md`, `01_GAME_DOSSIER.md`, `02_ART_DIRECTION.md` and
`03_CONVENTIONS.md` before anything else. The phase specs under `phases/` are the detailed
inventories for each phase; this file is the plan and the contract.

## Ground rules for the session

- **Plan first.** Write `PLAN.md`: every deliverable below, in order, with the method you will use
  for each. Then follow it.
- **Checkpoint after every phase.** Overwrite `S1-return.zip` at the end of each phase so a
  partial session still returns a coherent artifact. Keep `PROGRESS.md` current: phase, what
  exists, what is next, decisions made.
- **Never stop to ask.** Decide, record the decision in `NOTES.md` under `DECISIONS`, continue.
- **Masters, then scripts.** Image generation is your scarce resource. Generate a small number of
  large master sheets and derive the many assets from them with Python (Pillow). Code, SVG and
  packaging are cheap — spend the hours there.
- **Real strings only.** Every word on a frame or prototype comes from
  `01_GAME_DOSSIER.md` §4.
- **Fonts.** `inputs/` carries **Archivo** (variable: width 62–125, weight 100–900) and
  **Instrument Sans** (variable, tabular figures) as a baseline. You have the web: search for a
  better display face and text face if they exist, subject to one rule — the game bundles its
  fonts, so the licence must allow shipping inside a desktop game (SIL OFL, Apache, Fontshare's
  free licence, or a purchased app licence you recommend to the owner). Put the chosen files and
  licences in `kit/fonts/`, load them via `@font-face` with relative URLs, and record the choice
  and the rejected candidates in `kit-notes.md`. Frames made by image generation may only
  approximate a face; the prototypes set the real one.
- **Reference study.** Spend a bounded half hour on the web at the official galleries of the
  named references (Hardspace: Shipbreaker's HAB terminal and work orders, Armored Core VI's garage,
  Control's mission board, Destiny 2's character screen, Helldivers 2's ship management, Teenage
  Engineering and Braun product photography). Study technique — materials, light, hierarchy, how
  legends are lit, how depth is layered — and write six lines of findings into `NOTES.md`. Copy
  nothing.
- **The three title variants differ by world shot, not by material.** Build the kit once. The
  controller's pick of a variant decides which scene the game's stage renders behind the title;
  it does not change a plate, a key or a colour. Do not stall on "which variant is the kit for."
- **Prototypes open from `file://`.** Classic `<script>` tags (no ES modules), inline JSON
  fixtures, relative asset paths. Also ship `serve.py` (a two-line `http.server`) for
  convenience, but nothing may depend on it.

## Phases

### Phase 0 — Set up (short)

Return skeleton (§ Return contract), `PLAN.md`, `PROGRESS.md`, and three helper scripts you
will reuse all session: `tools/alpha_check.py` (fringe test on white and magenta),
`tools/nine_slice_test.py` (stretch a plate to 2× width / 3× height and save the result),
`tools/sheet.py` (compose a labelled contact sheet from a folder). Checkpoint.

### Phase 1 — Style frames (image generation) — spec `phases/P01.md`, `phases/P02.md`

Six frames at 1920×1080: **Title v1 "Hangar"**, **Title v2 "Field at dusk"**, **Title v3 "Bay
door"**, **Crucible door**, **HUD resting**, **HUD wanted**. For each: the composite, the plate
(scene without interface), and where you can, the interface layer on transparent. Then the crop
sheets (100 % crops of every distinct element) and **`kit-notes.md` v1**: the faces and sizes, every
hex, plate thickness / edge light / glass darkening / grain values, icon construction rules, and a
per-frame paragraph on composition and reading order. Run the two tests and the guard on each
frame yourself before moving on; redo any frame that reads as words on black, a cockpit, a
hologram, or a web page. Checkpoint.

### Phase 2 — Tokens (code)

From `kit-notes.md`: `tokens/tokens.json` and `tokens/tokens.css` (`--fh-*` custom properties):
colour roles and temperature states (§7 of the art direction), the type scale (12 → 200 px at
1920, ×0.75 at 1280 with the 12 px floor, ×1.25 at 2560), spacing, plate metrics (edge light,
shadow, radius or cut angle), motion durations and easings per register. Write
`tools/contrast.py` and prove every text-on-plate pairing in the tokens meets 4.5:1 (body) or
3:1 (large/UI); record the table in `QA.md`. Checkpoint.

### Phase 3 — The surface, control and instrument kits (image generation + Python) — specs `phases/P10.md`, `P11.md`, `P12.md`

Generate master sheets — plates and windows; keys and controls; gauges, bars and radar; sockets,
badges, tapes and strips; stripes, wear and grain — then derive every asset the three specs list:
nine-slice plates with slice metadata, state-complete sprite sets with exact registration,
tileables, wear overlays, gauge bezels and faces, the radar face and bezel, sockets in five
states, the badge and tape and strip plates. Every moving or data-driven part (needles, tick
rings, sweeps, radar glyphs, reticles, damage wedges, chevrons, cooldown rings) is **SVG geometry**
with documented pivots, not raster. Deliver @1x and @2x, run the alpha, registration and stretch
tests, and compose contact sheets. Checkpoint.

### Phase 4 — The icon family and the marks (hand-written SVG) — specs `phases/P13.md`, `phases/P14.md`

Write a small drawing helper (Python or JS) that emits SVG from a construction grammar so all 80
glyphs share one construction (filled form + one stroke detail, rounded-square grid, 24 / 32 / 48
masters, `currentColor` + an `accent` slot). Then the marks: the SPACEFACE stencil logotype (explore
in raster, choose, vectorise to outlined paths, deliver three lockups), the fourteen crests redrawn
to one construction (keep each faction's subject from `inputs/icons.js`), mode and arena marks,
difficulty insignia, system marks. Sprites, `glyph-paths.json` for canvas drawing, rendered sheets
at 24/32/48 and in black on white. Checkpoint.

### Phase 5 — Motion library and sound recipes (code) — spec `phases/P17.md`

`kit/motion.js` (classic script exposing `window.FH.motion`), `kit/motion.css`, `kit/sound.js`
(a WebAudio player for recipes in the game's own shape — see `inputs/audioRecipes.js` and
`synth.js`), `kit/sound-recipes.json` with the fourteen cues, `MOTION_SPEC.md`, `SOUND_SPEC.md`,
and demo pages for both. Every motion is driven by a state you pass in and returns a cancel
handle; reduced motion turns every transition into a cut. Checkpoint.

### Phase 6 — The kit page and the three hero screens (code)

`kit/index.html`: every component rendered from the produced assets with real strings — plates
in all variants, windows, keys in every state (hover/press live), toggles, sliders, steppers,
inputs, lights, engraved rows with the selected light, tiles, gauges with a live needle, segmented
bars, the radar face with a sweep and glyphs, sockets, the badge, the tape, the status strip,
stencil type at every scale, the icon family, the marks — on the ground colour and inside a
smoked window over one of your plates.

`screens/title.html` (with a `?v=1|2|3` switch for the three plates), `screens/crucible-door.html`,
`screens/hud.html` (with a resting/wanted toggle): the hero screens **built from the kit** to
match your frames — same composition, same materials, same type, real strings, the world plate as
the background image, the P17 reveal on load, sounds on focus and confirm, keyboard navigation
with a visible focus ring. `screens/_compare.html`: overlays any frame and its prototype at 50 %
opacity with a slider so you (and the controller) can see the delta. Checkpoint.

### Phase 7 — Self-review and package

Run every check in `_COMMON/03_CONVENTIONS.md` §7 over the kits; open every prototype and judge
it against the two tests and the guard; write `QA.md` (what passed, what you fixed, what remains);
validate `manifest.json`; final zip.

## Return contract

```
S1-return/
  PLAN.md · PROGRESS.md · NOTES.md · QA.md · manifest.json
  frames/   frame-title-v1..v3.png · frame-crucible-door.png · frame-hud-resting.png · frame-hud-wanted.png
  plates/   plate-title-v1..v3.png · plate-crucible-door.png · plate-flight.png
  layers/   (when produced)
  crops/    crops-title.png · crops-crucible.png · crops-hud.png
  kit-notes.md
  tokens/   tokens.json · tokens.css
  assets/   plates/ windows/ tiles/ keys/ controls/ lights/ gauges/ radar/ sockets/ badges/ tapes/ strips/ wear/  (+ _contact-sheet.png per folder)
  icons/    24/ 32/ 48/ _sprite-24.svg _sprite-32.svg _sprite-48.svg glyph-paths.json _sheet.png ICON_RULES.md
  marks/    logotype/ crests/ modes/ arenas/ insignia/ system/ _sprite.svg _sheet.png
  kit/      index.html · fh.css (the component CSS built on tokens.css and the assets) · fh.js (component behaviours) · motion.js · motion.css · sound.js · sound-recipes.json · demo-motion.html · demo-sound.html · fonts/ (the two woff2 + OFL)
  screens/  title.html · crucible-door.html · hud.html · _compare.html · fixtures.js (the strings as data)
  tools/    the scripts you wrote
  serve.py
```

## Definition of done

1. All six frames, plates, crops and `kit-notes.md` exist; each frame passes the two tests and
   the guard (record the judgement per frame in `QA.md`).
2. Every asset in the three kit specs exists at @1x and @2x with manifest metadata; alpha,
   registration and stretch tests recorded; contact sheets present.
3. 80 icons × 3 sizes, sprites, paths JSON, sheets; the marks complete; forced-colours renders
   pass.
4. Motion and sound libraries run from their demo pages; reduced motion is cuts.
5. `kit/index.html` renders every component from assets (a grep of `fh.css` for
   `linear-gradient`, `box-shadow` or `border:` used as material finds none).
6. The three hero prototypes open from `file://`, match their frames in `_compare.html`, use the
   real fonts, and are keyboard-navigable with a visible focus ring.
7. `manifest.json` validates; `NOTES.md` lists every gap honestly under `MISSING` and every
   choice under `DECISIONS`.

## What the next session consumes

S2 receives this whole return. It builds the BENCH screens on `kit/fh.css` and your tokens, so
name things well and keep the CSS classes documented at the top of `fh.css`.

## The way this session gets faked

Frames that are concept paintings rather than the game's screens; a kit page styled with CSS
gradients and shadows "to look like" the assets; icons that are line glyphs; prototypes that only
work over `http://`; a `NOTES.md` that claims files that are not in the zip.
