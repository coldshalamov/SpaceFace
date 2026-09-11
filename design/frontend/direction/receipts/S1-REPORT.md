# S1-REPORT — the design system

Append-only. Do not rewrite an entry; add a new one beneath.

---

## 2026-09-10 · S1 / PQ-194.00 · claude-opus-5, local shared checkout

**DONE** PQ-194.00 — SpaceFace's new interface exists as six approved style frames, a complete
produced asset kit, and three hero screens that run in a browser and match their frames.

**WHAT I FOUND** The packet routes every raster to ChatGPT's native image-generation tool, which
this harness does not have — but the repository already contains 1,376 production GLBs of the
actual game world and a Blender 5.1 install, so the world behind every frame could be the real
world rather than a picture of one.

**WHAT I CHANGED** Authored the Field Hardware material library and drove it to produce every
surface, control and instrument the direction names; rendered five lit world shots from the
game's own models; composed six frames over them with real type; generated the icon family, the
logotype and the marks; wrote the tokens, the motion library and the sound cue set; and built a
kit page and three working screens from the result.

**WHAT YOU WILL FEEL** The title screen is now a photograph of your own ship parked on a rock at
dusk, with the menu lit on a machined rail beside it — not words on a black background. Press a
key anywhere in the kit and the plate physically sinks two pixels under your finger and thocks.

**THE NUMBERS**

| Bar | Before | After | Target | Seed |
|---|---|---|---|---|
| Approved style frames | 0 (folder empty) | **6**, each passing the two tests and the guard | 6 | — |
| Produced UI assets in the repo | 12 files, most in a dead refit | **157 manifested** (293 PNG files @1x + @2x + contact sheets, 15 SVG geometry parts) | "asset-first" | — |
| Alpha fringe on white and magenta | — | **0 fringing / 293 files** | 0 | — |
| Sprite-state registration drift | — | **0.00–0.03 px** over 46 comparisons across 12 control families | ≤ 0.5 px | — |
| Nine-slice stretch at 2×w / 3×h | — | **52 plates**, corners self-contained | all | — |
| Icon family | 24 px line glyphs | **86 filled glyphs × 24/32/48** from one construction grammar | ~80 | — |
| Marks | 2 SVGs | **41** (logotype ×3, 14 crests, 5 modes, 5 arenas, 4 insignia, 9 system) | all | — |
| WCAG pairings proven | none measured | **21 declared, 21 pass** | 21 | — |
| CSS used as material in `fh.css` | the entire previous skin | **0** gradients, **0** shadows, **0** `border:` | 0 | — |
| Looping animations in the motion layer | — | **0** (`iteration-count` never above 1) | 0 | — |
| Prototypes opening from `file://` with 0 console errors | — | **10 / 10**, at 1920 **and** 1280 | all | — |
| Worst frame-vs-prototype vertical delta | not measured | **89 px → 45 px** after four alignment bugs were found and fixed | small | — |
| Sound cue set | 0 UI cues authored | **14 cues, 4.98 s total**, in the game's own recipe shape; all 14 **played** in a real `AudioContext`, 0 failures | 14 | — |
| Entry vs exit `check:baseline` reds | 3 (`sim`, `sim-v3`, `pq020-ceres-topology`) | **3, identical** | no new reds | 47 |

**FILES**

```
design/frontend/direction/approved/
  README.md · DECISIONS.md · kit-notes.md
  frames/   frame-title-v1.png  frame-title-v2.png  frame-title-v3.png
            frame-crucible-door.png  frame-hud-resting.png  frame-hud-wanted.png
  plates/   plate-title-v1..v3.png  plate-crucible-door.png  plate-flight.png
  layers/   layer-title-v1..v3.png  layer-crucible-door.png
            layer-hud-resting.png  layer-hud-wanted.png
  crops/    crops-title.png  crops-crucible.png  crops-hud.png  crops-hud-wanted.png

assets/ui/kit/
  kit-manifest.json
  tokens/   tokens.json  tokens.css
  assets/   plates/ windows/ tiles/ keys/ controls/ lights/ gauges/ radar/ sockets/
            badges/ tapes/ strips/ wear/ svg/   (+ _contact-sheet.png per folder)
  icons/    24/ 32/ 48/  _sprite-24|32|48.svg  glyph-paths.json
            _sheet.png  _sheet-forced-colours.png
  marks/    logotype/ crests/ modes/ arenas/ insignia/ system/  _sprite.svg
            _sheet.png  _sheet-forced-colours.png
  kit/      index.html  fh.css  fh.js  motion.js  motion.css  sound.js
            sound-recipes.json  sound-recipes.js  sprites.js
            MOTION_SPEC.md  SOUND_SPEC.md  demo-motion.html  demo-sound.html  fonts/
  screens/  title.html  crucible-door.html  hud.html  _compare.html  fixtures.js
  tools/    bl_common.py  bl_world.py  bl_scenes.py  bl_kit.py  cut_kit.py
            fh_compose.py  frame_title.py  frame_screens.py  crops.py
            icons.py  marks.py  svg_parts.py  fontkit.py  contrast.py
            alpha_check.py  nine_slice_test.py  sheet.py  build_tokens_css.py
            build_sound_js.py  build_sprites_js.py  render_svg_sheets.mjs
            svg_png.mjs  shoot_screens.mjs
  serve.py

design/frontend/direction/receipts/S1-REPORT.md   (this file)
design/program/NOW.md                             (one row, this lane's exact paths)
.devshots/delegate-20260910/scratch/pq-194/       (PLAN, PROGRESS, NOTES, QA, logs, build)
```

Nothing under `src/`, `styles/`, `test/` or any sim path was touched.

**CHECKS**

| Command | Result |
|---|---|
| `npm run check:baseline` (entry) | FAIL ×3 — `sim`, `sim-v3`, `pq020-ceres-topology`; the three pre-existing reds `_COMMON.md` names |
| `npm run check:baseline` (exit) | FAIL ×3 — **identical set, no new reds** |
| `python assets/ui/kit/tools/contrast.py` | PASS — 21 pairings, 0 below floor |
| `python assets/ui/kit/tools/alpha_check.py assets/ui/kit/assets` | PASS — 293 assets, 0 fringing |
| `python assets/ui/kit/tools/cut_kit.py` (registration + stretch) | PASS — 0.00–0.03 px drift; 52 plates stretched |
| `node assets/ui/kit/tools/shoot_screens.mjs` | PASS — 10 targets, 0 console errors |
| `node assets/ui/kit/tools/shoot_screens.mjs … --width 1280` | PASS — 3 targets, 0 console errors |
| `node assets/ui/kit/tools/validate_sound.mjs` | PASS — 14 cues built and played in a running `AudioContext`, 0 failures |
| `python assets/ui/kit/tools/measure_delta.py` | 14 regions across 3 screens; worst vertical delta **45 px** (title within 14 px everywhere, wordmark exact) |
| manifest against `03_CONVENTIONS.md` §6 | PASS — keys, records, every named file present, every 9-slice has slice metadata, every asset at its stated size, nothing over 2 MB |
| `grep -E "linear-gradient\|box-shadow\|border:" fh.css` | PASS — nothing but `border: 0` resets and `border-image-*` |

**UNPROVEN**

- **The owner has not looked.** Per the programme the title going live at P22 is the veto point;
  nothing here is an owner verdict.
- **No live-engine capture.** This leaf is frames + kit + prototypes by design; the screens run
  from `file://`, not on the game's default route. The `--world` capture that acceptance
  ultimately turns on belongs to leaf `.01` (P20) and `.05` (P22).
- **No memoryless vision review.** The two tests and the guard were judged by me, per frame, and
  written down in `QA.md` §1 — that is a self-judgement, not the independent review the
  programme's §6 asks for before a frame is treated as settled.
- **Nobody has heard the sound.** `validate_sound.mjs` proves all fourteen cues build and run
  a real WebAudio graph without error; headless Chromium has no output device, so the audio
  clock does not advance and the cues have not been listened to.
- **The HUD's instruments sit 18–45 px above their frame positions** *inside* their plates —
  the plates themselves are at identical coordinates. Measured by `measure_delta.py` and
  recorded in `QA.md` §5; the engine port should close it against that tool.
- **Frame performance is unmeasured.** No `check:ui:budgets`, `check:ui:perf` or DOM-node count
  was run against these prototypes: they are not in `src/ui/` and the budgets tool reads that
  tree. The prototypes park every rAF and the motion layer has no looping animation, but "≤ 2 ms
  UI frame" is asserted by construction here, not measured.
- **The Blender provenance decision is mine.** It is recorded loudly in `DECISIONS.md`,
  `kit-notes.md` and `kit-manifest.json`; if the controller rejects it, every raster is
  regenerable and the SVG, token, motion, sound and prototype work is unaffected.
- **Seven gaps are listed under MISSING** in `scratch/pq-194/NOTES.md`, including the wear
  overlays being produced but not yet placed on any screen, and the flight plate's nebula and
  gas giant falling outside the composed camera's view cone.
