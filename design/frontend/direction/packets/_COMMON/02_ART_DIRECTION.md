# Field Hardware — the art direction

**Status:** the aesthetic authority for every SpaceFace screen and the HUD, decided 2026-09-10.
Rendered frames approved under `design/frontend/direction/approved/` outrank this prose; this prose
outranks every other document. Read `01_GAME_DOSSIER.md` first if you have not.

---

## 1. The idea in one paragraph

SpaceFace's interface is **field hardware**: the manufactured, backlit, hand-worn equipment of a
working pilot, laid over a living world. Every screen is a lit shot of that world — the hull in its
rig, the berth, the arena, the deep-field sky — with instruments built from real materials sitting on
it: machined plates with thickness and edge light, amber backlit legends, safety markings, smoked
glass windows that look through to the scene. Type is big and confident, like stencilled hull
markings and film titles. Icons are one filled family. Numbers are instruments, not spreadsheet
cells. It is warm, physical and modern — Hardspace: Shipbreaker's tactility, Control's editorial
scale, Armored Core VI's machined precision — and it is **never a cockpit, never a hologram, never a
web page.**

## 2. The two tests every frame must pass

1. **The Asteroid Works test.** The one screen the owner has ever liked is the mining board: real
   rock texture, warm directional light, a physical machine, almost no chrome. Ask of any frame:
   *does it have that material and light truth, or is it flat colour with words on it?*
2. **The Shipbreaker test.** Ask: *does this read as equipment a worker uses — tactile, warm,
   task-first, built — or as a dashboard someone configured?*

A frame that fails either test is not finished, no matter how clean it is.

## 3. Three registers (composition by screen type)

Every screen belongs to exactly one register. Screens in the same register share bones; screens in
different registers must not share a silhouette.

| Register | What it is | Screens | Composition |
|---|---|---|---|
| **POSTER** | A cinematic full-bleed shot of the world with a few enormous words and one or two hardware elements. Film title card energy. | Title, Crucible door, Crucible results, docking arrival, game over, new game, first undock | The world fills the frame, lit. One element at ≥ 120 px (a name, a number). Words hang from one edge. Hardware appears as one plate or one key, not a panel set. Slow camera drift; parallax ≤ 6 px on pointer. |
| **BENCH** | A workbench of instruments: machined plates with backlit legends and smoked-glass windows that look through to the live scene. The pilot manipulates things here. | Station (market, ledger, contracts, factions, industry, bar, shipworks), THE SHIP, the chart, settings, load, missions log, codex, help, tech tree, Crucible draft/refit | The scene stays visible through windows and around the bench (never fully covered). Plates have thickness, edge light and a hierarchy of sizes. The centerpiece (hull, chart, table) is the largest object. Lists of *things* are tiles with images; lists of *facts* are engraved rows. |
| **EDGE** | Small instruments pinned to the frame edges over the live flight picture. | Flight HUD, pause overlay, Asteroid Works chrome | Nothing in the middle third. Each instrument is a real gauge, socket, badge or tape, in the same material vocabulary at small scale. Resting state is dim (legends at 40 %), wakes on change. No plate larger than 1/6 of the frame. |

## 4. Materials (what things are made of)

Use these and nothing else. Each is produced as an asset (rendered plate, 9-slice, sprite, SVG),
never faked with CSS borders and flat fills.

| Material | Where | How it reads |
|---|---|---|
| **Gunmetal plate** | Every panel, key, bezel | Matte anodised dark metal. Real thickness (a 2–4 px lit top edge at 1080p, a 1–2 px shadow under). Corners machined: small radius or one signature cut angle on primary plates only. Surface has faint brushed grain, never gloss. |
| **Backlit legend** | Labels, section names, key legends, active states | Amber light behind a cut stencil. Dims to 40 % at rest, 100 % when live, off when disabled. The *light* is the state, not a colour swap. |
| **Smoked glass window** | Where the scene shows through a plate; hull viewports; the radar face | A darkening pane (35–55 %) with a thin lit rim and a faint reflection strip. The world behind is *sharp* (no DOM blur — depth of field is rendered in the scene if wanted). |
| **Etched marks** | Tick rings, scales, hairlines, grid marks, row separators | Fine lines cut into the plate, slightly lighter than the plate, never glowing. |
| **Safety paint** | Hazard channel only: wanted, danger, destructive actions, arena rules | Orange/yellow chevron stripe, chipped at the edges. Used on ≤ 1 element per screen. |
| **Status light** | Readiness, online/offline, lock | A tiny backlit dot or bar with a soft halo baked into the asset. |
| **Wear** | Plate edges, socket rims, the bottom of tiles | Paint chips, corner grime, fingerprints on glass. Subtle: ≤ 8 % of any surface, never touching text. |
| **Stencil marking** | Hull names, arena names, big numerals, the title | The display face applied as painted marking on plate or on the world. Slightly rough edge, slightly uneven ink. |

Sources of truth for the look, by name (no imagery copied — study the *techniques*): Hardspace:
Shipbreaker (HAB terminal, work order), Armored Core VI (garage, assembly), Control (mission
board), Death Stranding (delivery results), Destiny 2 (character screen composition), Helldivers 2
(ship management as a lit set), Teenage Engineering and Braun industrial products (backlit legends,
machined plates, restraint), aerospace ground-support equipment (safety paint, stencil, wear).

## 5. Anti-patterns (the guard)

- **Not a cockpit.** No visor, windshield or helmet framing; no screen-edge arcs; no pilot
  portrait in a corner. This is a third-person game and the owner has rejected this twice.
- **Not 2010 skeuomorphism.** No leather, wood, chrome gloss, glossy bevels, stitched edges,
  drop-shadow buttons with rounded gel highlights. Hardware here is *modern industrial design*:
  flat planes, machined edges, backlit text, restraint.
- **Not sci-fi cliché.** No holograms, scanlines, glitch, hex grids, cyan wireframe, neon,
  spinning rings, "loading" tech circles, typewriter text.
- **Not a web page.** No bordered text boxes, cards with hairline borders, tabs that are words in a
  row, filled rectangle buttons, tables as the primary presentation of things that have pictures,
  system-looking sans at 14 px everywhere. If a frame could be mistaken for an admin dashboard or a
  settings page, it fails.
- **Not empty.** "Minimal" is not a licence for a black screen with words. Every screen has the lit
  world, at least one manufactured object, and at least one enormous element.
- **Not gray.** The ground is warm near-black, plates are warm gunmetal, light is amber. Gray-blue
  neutrals read as bleak and were rejected.
- **Not noisy.** One hazard element per screen; ≤ 2 accent hues in view; wear ≤ 8 %; decoration
  that carries no state is cut.

## 6. Type

| Role | Face | Setting |
|---|---|---|
| Display / stencil (names, titles, hero numbers, arena and mode names) | **Archivo** (variable: width 62–125, weight 100–900, OFL) — Expanded 800–900 for names and titles, Condensed 500–600 for legends | uppercase allowed here (it is a marking), tracking +0.02 em expanded / +0.06 em condensed, line-height 0.9 |
| Text (sentences, rows, help, codex) | **Instrument Sans** (variable, OFL, already vendored) | 400 body, 500 emphasis, sentence case, line-height 1.4, measure ≤ 64 ch |
| Data numerals (tables, readouts) | Instrument Sans tabular (`tnum`) or Archivo Condensed tabular if verified | right-aligned, never proportional |
| Hero numerals (speed, credits, price, score) | Archivo Expanded 800, tabular | the one number the screen is about |

Alternates a frame may propose (all OFL, vendorable offline): Tektur, Chakra Petch, Barlow /
Barlow Condensed, Big Shoulders Display. Never a face that cannot be vendored as woff2.

Scale at 1920 px wide (×0.75 at 1280 with a 12 px floor; ×1.25 at 2560): 12 fine print · 14 data ·
16 body · 20 emphasis · 28 subhead · 40 menu · 64 hero number · 96 screen title · 140 hero ·
200 name. **Every screen has at least one element at 64 px or larger.**

## 7. Colour and temperature

Starting values; the approved frames' `kit-notes.md` sets the final hexes.

| Token | Value | Role |
|---|---|---|
| ground | `#0C0A08` | the painted background where no scene exists; warm near-black |
| plate | `#1A1714` / plate-raised `#26211B` / plate-sunk `#100E0C` | gunmetal surfaces |
| edge-light | `#F2B950` at 30–45 % | lit top edges of plates and windows |
| bone | `#EAE6DF` | text on plates; 100 % live, 62 % resting, 38 % tertiary |
| legend | `#FFB347` | backlit legend light (amber) |
| signal | `#F2B950` | the actionable thing; the selected row's light; primary key legend |
| hazard | `#FF6A2B` | safety paint, destructive, danger |
| wanted | `#FF4D3D` | replaces signal while wanted |
| good / bad | `#9BD8A0` / `#FF7A6B` | numerals only |
| glass | `#05070A` at 35–55 % | smoked windows |

**Temperature states** (the whole frame changes, not a badge): flight = neutral warm · docked =
warmer (plates +6 % red, legends brighter) · wanted = the backlights go cold white-blue
(`#DDE6FF`) and every signal turns `wanted` red, one sustained cold tone · Crucible = white-hot
(legends `#FFFFFF`, edge-light white, hazard stripes live) · Asteroid Works keeps its own accepted
law.

## 8. Iconography and imagery

- **One icon family**, ~80 glyphs: filled forms with one stroke detail, built on a rounded-square
  grid, 24 / 32 / 48 optical masters, `currentColor` fill with an accent slot for the amber light.
  Verbs (buy, sell, accept, undock, tow, seed, well, repel, cone, skim, fire, lock), things
  (modules, weapons, hulls, cargo, ore, fuel), classes (contact classes for the radar), states
  (ready, cooling, locked, offline). Line-only web icons are not this family.
- **Marks**: the game's logotype, 14 faction crests redrawn to one construction, mode and arena
  marks, difficulty insignia, rank plates — layered SVG, usable at 24 px and at 240 px.
- **Rendered imagery**: hulls rendered from the real GLBs at one fixed studio lighting (turntable
  script) for tiles and portraits; arena and mode keyart; berth and hangar sets. **Any list of
  things that exist in the world (modes, arenas, builds, hulls, saves, contacts) is a row of imaged
  tiles, never a row of words.**
- Portraits already exist and are kept.

## 9. Motion

| Register | Language | Numbers |
|---|---|---|
| POSTER | cinematic: staggered reveal with mass; hero type stamps in; slow camera drift; pointer parallax | stagger 40 ms, settle 240–320 ms, ease `cubic-bezier(0.2, 0.8, 0.2, 1)`; drift ≤ 0.5°/s; parallax ≤ 6 px |
| BENCH | mechanical: plates slide in with weight and a 1-frame overshoot; legends light up; keys depress | slide 180–220 ms, light-up 80–120 ms, press 60 ms down / 120 ms up |
| EDGE | instrument: needles and values ease; an alert pulses **once** then holds; nothing loops in flight | value ease 120 ms; single pulse 400 ms |

Every motion is started by a named state variable. Reduced motion: every transition becomes a cut,
ambient drift stops, parallax off. Ambient micro-motion (drift, a status light breathing, glass
reflection sweep) is allowed **only** on paused BENCH/POSTER screens and only with reduced motion
off.

## 10. Sound

A low mechanical vocabulary through the existing `audio:cue` bus: key press (a short thock), plate
slide (a damped whoosh), legend light-up (a barely-there tick), confirm (one clear tone), deny (a
dull two-note fall), dock (a low swell), undock (the swell reversed), wanted (one sustained cold
tone), Crucible enter (a hard metallic strike). Synthesised recipes first; sampled later if a
sample lane exists. Silence is the default.

## 11. What survives and what retires

**Survives (the bones):** the screen manager and screen memory; the three-anchor HUD layout, the
Power Rail and its slot-claim contract, the receipts channel; the station OS and its six
instruments; the instruments' centerpieces and verbs (orbit the hull, trace the graph, fly the box,
push the chart); the hangar-rig hull render and the shared ship stage; the chart's star-system
drawing; the data states and entity links; the accessibility floor; the performance floor.

**Retires (the skin, entirely):** every visual treatment of the current UI — the word-column menu,
the hairline rows, the bordered text boxes, the stroke icon set as the primary family, the flat
filled buttons, the Bricolage/Instrument-only voice, the cut-and-settle-only motion, the black
grounds. Nothing of the current look is a reference for the new one.

**The floors that are not aesthetic and must not be "cleaned up" with the skin:** 12 px minimum
text; WCAG AA contrast on text; reduced-motion and flash-reduce honoured; forced-colors (inline
SVG and `currentColor` survive it; CSS `background-image` icons do not); keyboard and gamepad
reachability with a visible focus ring; ≤ 2 ms UI frame cost in flight; DOM node budgets; no
`backdrop-filter` in flight; the simulation untouched.
