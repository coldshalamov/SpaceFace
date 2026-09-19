# Frontend program — every surface to A-list

**Started 2026-09-19. Owner instruction:** "continue until you've covered every frontend surface and
verified full A-list quality; generic CSS components should only be used when they're literally the
best option instead of custom assets or more complex packages or libraries."

This page is the plan *and* the live status board. The first unit's results are in
[`HUD-2026-09-18.md`](./HUD-2026-09-18.md).

## Status board

| Wave | Surfaces | State |
|---|---|---|
| 0 · Materials + components | the shared hardware every screen assembles | in progress |
| 1 · EDGE (flight layer) | flight, power-rail, comms-radial, wingman-radial | flight at 4/10 (needs structural pass) |
| 2 · POSTER + shell | title, new-game, pause, settings, save-load, help, credits, codex, mission-log, tech-tree, game-over | not started |
| 3 · Station | dock, market, shipworks, industry, contracts, factions, bar, ledger | not started |
| 4 · Instruments | ship, footprint, range, chart, chart-galaxy | not started |
| 5 · Crucible + Works | crucible door/draft/refit/results, asteroid-works, base, automation | not started |

A surface only moves to **passed** through the gate below. Nothing is "passed" by its author.

## 1. What the survey found (2026-09-19, all 35 surfaces at 1920)

The frontend speaks **three unrelated visual languages**:

1. **Warm kit plates:** title, new game, chart, codex, the crucible door.
2. **Cold teal app panels:** every station tab, automation, base, and both radials.
3. **Words on black:** crucible draft, refit and results, footprint, game over, mission log, tech
   tree.

Screens are assembled from a typographic kit (`k-word`, `k-sentence`, `k-row`: about 2,700 uses)
with almost no panel or hardware component (4 uses). An A-list frontend is *one* system. So the
program leads with the shared hardware, then walks every surface.

The 2026-09-10 kit (`assets/ui/kit/`, 157 Blender renders) splits two ways:

- **Keep as-is:** the rendered keyart. That covers the arena, mode and difficulty tiles, the
  hangar/berth/bench backdrops (cold variants), 86 icons at three sizes, 41 marks and crests, and
  the fonts.
- **Rebuild:** the hardware pieces (plates, keys, controls, glass windows). They render as
  near-black *brown* with a hairline edge. That is the "strange wood look" the owner rejected on
  2026-09-14, and it is too faint to carry a screen.

## 2. Direction: glass instruments in machined bezels

Reconciles every owner signal on record:

- 09-10: "generic and simple for an A-list spaceship game."
- The praised artifact: "real rock texture, warm directional light, a physical machine, almost no
  chrome."
- 09-14: "not wood … more sleek and glass … slight neon."
- 09-18: "consistent, high-detail, creative, interactive, non-generic."

A real glass cockpit answers all of them. **Displays are smoked glass** (sleek; data glows on
them). **Glass sits in machined gunmetal bezels** (a physical machine, under one warm key light).
**Materials differ by function**, never one gradient on every panel:

| Material | Used for | Made of |
|---|---|---|
| Bezel | structure, frames, rails | authored SVG hardware: chamfers, fasteners, seams, brackets, plus a brushed-gunmetal texture |
| Glass | every display surface (readings, lists, maps) | deep smoked face, top reflection as *light*, emissive content |
| Placard | legends, section heads, hazard/destructive actions | painted/etched strips, hazard stripe texture |
| Key | every control | keycap hardware with a legend lamp. State lives in the lamp, not the outline |
| Keyart | modes, arenas, ships, factions | the rendered tiles, crests and backdrops |
| World | behind menus | the live lit stage (`src/render/uiStage.js`, one GL context) or a rendered backdrop |

**Colour, option B (the owner did not choose; B keeps the one-accent law and is reversible).**
Gunmetal neutrals and bone ink carry *information*. The one warm lamp marks what is *actionable,
live or selected*. Red, the lamp driven to failure, is reserved for *threat and destruction*. So a
hostile always has a colour nothing else uses.

**Type.**
- Archivo, variable on the width axis: display titles (wide) and etched legends (condensed).
- Instrument Sans: reading text.
- Spline Sans Mono: data.

These are already shipped under the OFL. The 12 px floor holds everywhere.

**Motion and sound.**
- Every surface enters with a choreographed reveal: the bezel settles, then the glass lights, then
  the content types on.
- Every control has hover, press and focus states with a matched UI sound cue (the kit's 14 cues
  through the existing audio recipes).
- Reduced motion swaps all of it for instant state plus a word.

## 3. Assets and libraries: what gets built, not styled

| Need | Choice | Why this beats a generic CSS component |
|---|---|---|
| Frames, bezels, keys, toggles, sliders, steppers, brackets, gauges | **Authored SVG hardware** (`src/ui/deckplate/hardware/`) | Detail a border cannot draw (chamfers, fasteners, seams, knurling, LED lenses). Crisp at every DPI, stays true in forced colours (`currentColor`), themeable by token |
| Metal and glass micro-detail | **Texture bake script** (`assets/ui/deckplate/tools/`, numpy): brushed gunmetal, grain, glass smudge, as PNG tiles | Real surface finish at a fixed cost. Deterministic and re-bakeable |
| Icons | **Kit sprite** (86 glyphs, 24/32/48) through one `dpIcon()` helper | One family everywhere, no line-glyph drift |
| Keyart, crests, backdrops | **Kit renders** (tiles, marks, cold backdrops) | Already A-list. Only needs consuming |
| 3D behind menus, ship previews | **Three.js**, already vendored, through `uiStage` | A lit world instead of a flat colour, still one GL context |
| Orchestrated sequences (dock, lock-on, escalation, screen reveals) | **Web Animations API** first; **GSAP** only if a sequence needs timeline control WAAPI cannot give. Named, not yet adopted | WAAPI is native and zero-bundle. A library earns its place only on a real need |

**CSS is still the right tool for:** layout (grid and flex), tokens, typography, and light
gradients drawn *as light*. It is not used as the material.

## 4. The gate: how a surface passes

A surface passes only when **all** of these hold:

1. **Live stills** at 1280×720, 1920×1080 and 2560×1080 from the real route (`ui-stills`). Plus
   `--world` for screens with a world behind them, captured one surface at a time and never as a
   long matrix run.
2. **Three memoryless reviewers** (`docs/UI_VISUAL_ITERATION.md` §4) who never see the code or the
   author's intent: (A) layout forensics, (B) direction and craft, (C) legibility and reach. Each
   scores on six axes: composition, hierarchy, typography, material and light, distinctiveness,
   motion. **Pass is ≥ 7 overall with no axis below 6.** Anything less goes back into the loop.
3. **Asset coverage.** The surface's module names the hardware, textures, icons and keyart it
   consumes. A surface built from borders, gradients and shadows alone fails before anyone looks
   at it.
4. **Every control proven** by `ui-look` (it clicks every control and reports what changed).
5. **Floors green:**
   - type floor, WCAG contrast, UI a11y, identity, native titles and UI effects;
   - `check:ui:layout --only=<id>` and `check:baseline`;
   - keyboard *and* gamepad reach every control with a visible focus;
   - reduced motion and forced colours hold.
6. **The A-list checklist rows for the surface** (below): states designed (empty, loading, error,
   denied), no placeholder or broken strings, text expansion tolerated, screen memory, a sound on
   every control.

## 5. The A-list checklist (applied per surface)

- **One system.** Same hardware, type voices, spacing unit and motion curves on every surface.
- **Hierarchy.** One glance yields the screen's purpose and its primary action.
- **Designed states.** Empty, loading, error and denied states are drawn, not blank
  (`design/frontend/A_LIST_GAPS.md` §2).
- **Feedback.** Every control has hover, press, focus and disabled states, each with sound; every
  number that changes animates.
- **Input parity.** Mouse, keyboard and gamepad reach everything, and prompts show the right key
  glyph for the active device.
- **Copy.** No placeholder strings (e.g. `ETA —·→`); the voice stays consistent; text expansion
  up to +35 % holds without clipping.
- **Resolution.** 1280×720 through 2560×1080 and ultrawide, with no collision, clip or off-edge.
- **Accessibility.** Contrast, 12 px floor, reduced motion, forced colours, and screen-reader
  labels.
- **Performance.** ≤ 2 ms UI frame, ≤ 1,500 DOM nodes, no idle animation loop, one GL context,
  and no black screen.

## 6. Every surface

Register, owner module, and the kit/keyart each should consume. "Found" is the 2026-09-19 survey.

| Wave | Surface | Owner module | Found | Assembles |
|---|---|---|---|---|
| 1 | flight | `src/ui/hud.js` + `views/hudStyles.js` | 4/10; 8 boxes, no threat channel | one instrument cluster, glass gauges, tether gauge, threat lamp |
| 1 | power-rail | `src/ui/powerRail.js` | fair; sockets read well | socket hardware, key glyphs |
| 1 | comms-radial | `src/ui/commsRadial.js` | cold generic list | radial glass sectors, icons |
| 1 | wingman-radial | `src/ui/wingmanRadial.js` | blue neon circles | radial keys, icons |
| 2 | title | `screens/mainMenu.js` | decent: hangar render + logotype | logotype mark, keys, live stage |
| 2 | new-game | `screens/newGame.js` | decent: hangar render | keys, difficulty tiles, ship keyart |
| 2 | pause | `screens/pause.js` | words list on a plate | glass menu column, keys |
| 2 | settings | `screens/settings.js` | dark list | toggles, sliders, steppers, tabs |
| 2 | save-load | `screens/saveLoad.js` | plate + big number | slot cards, ship keyart |
| 2 | help | `screens/help.js` | list of dark bars | glass tabs, key glyphs |
| 2 | credits | `screens/credits.js` | title + plate | logotype, marks |
| 2 | codex | `screens/codex.js` | tan paper plate | glass reader, icons, crests |
| 2 | mission-log | `screens/missionLog.js` | words on black | glass list + reader, status lamps |
| 2 | tech-tree | `screens/techTree.js` | mostly empty | node hardware, links, icons |
| 2 | game-over | `screens/gameOver.js` | words on black | poster composition, placards |
| 3 | station-dock + 7 tabs | `src/ui/station/**` (market live-edited by another lane) | cold teal app panels | glass consoles in bezels, icons, crests |
| 4 | ship | `src/ui/ship/shipScreen.js` | words over a hull | glass readouts around the live hull |
| 4 | footprint | `screens/footprint.js` | words on black | board hardware |
| 4 | range | `screens/range.js` | framed instrument | glass range scope |
| 4 | chart, chart-galaxy | `src/ui/galaxyMap.js` | kit brown buttons | glass map chrome, keys |
| 5 | crucible-door | `screens/crucible.js` | strongest today: arena keyart | keep, retone hardware |
| 5 | crucible-draft/refit/results | `screens/crucibleDraft.js`, `crucible.js` | words on black | card hardware, arena keyart |
| 5 | asteroid-works | `src/ui/asteroid/*` | timed out in survey | bench hardware |
| 5 | base, automation | `screens/base.js`, `automationPanel.js` | cold dashboard | glass consoles |

## 7. Order and veto points

1. **Wave 0**, the hardware and textures, proven on a kit page, not in prose.
2. **The flight HUD structural pass.** Both critics' asks map onto it. It is the proof that the
   system can pass the gate.
3. **The title**, the owner's first veto point: boot the game and look.
4. Then settings (it exercises every control), pause, save-load, the station, and the rest.

The owner can veto at any surface; a veto is recorded in the owner's words and the surface goes
back into the loop.

## 8. Constraints

- Other lanes are live in the tree. Station `market.js` and `styles/station-orbital.css` belong to
  a live checkpoint. Work stays in owned paths, with pathspec commits and a checkpoint row.
- No long runs: each capture covers one surface or one group, never the 35-surface matrix with
  `--world`.
- Gameplay, the input contract, determinism goldens and the sim are untouched. The work lives in
  `src/ui/`, `styles/`, and `assets/ui/`.
