<!-- LIFETIME: ACTIVE_PROGRAM -->
# ORRERY handoff — continue the frontend pass, more granular and more attentive

Written 2026-09-23 at the end of a long ORRERY session. A fresh session picks the pass up from here.
Direction lives in [`ORRERY.md`](./ORRERY.md) (owner authority); this file is the state of play, the
method that worked, the traps that cost rounds, and a ranked, screen-by-screen backlog.

## 0. The job in one paragraph

The owner does not read code. They want every screen to read as a 2026 A-list game interface: an
instrument of light, not a web page. That means rings, arcs, scales and leaders over borderless
glass; warm bone at rest; one amber Hand on the current choice; ice only for data in motion; red
only for threat; produced art for objects. It must never be recognisable as CSS: no cards, pills,
table rows, bordered boxes or link underlines. Each screen passes only when an independent critic
subagent scores it **>= 8/10 overall with no axis below 7**, looking at real screenshots at 1920x1080
**and** 1280x720. Commit every round. Do not stop at "good enough". The owner's word for the gap is
"cheap and vibe-coded"; the bar is "clean, expensive, a cockpit from the future".

## 1. Read first (in this order, then stop reading and build)

1. [`ORRERY.md`](./ORRERY.md): palette law (§3), the element catalogue (§4), the per-screen
   intent (§6). §6 is the target for every screen below.
2. [`docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md): the bench loop.
3. `src/ui/orrery/`, the library (see §3 here). Read `hullSchematic.js`, `stationLayouts.js` and
   `marketLayouts.js` end to end. They are the reference compositions.
4. The memory note `orrery-is-the-frontend-authority` (loaded automatically in this project) has the
   same traps with history.

## 2. Status board (2026-09-23 night)

| Screen | State | Last score | Composition file | What is left |
|---|---|---|---|---|
| Flight HUD (bench `orrery-flight`) | Phase 0a passed; live via `hudAdapter.js` | 8 | `flightPreview.js`, `hudSkin.js` | Live-route pass: ring brightness, orphan hairlines, objective dial. Radar/lock ring/threat channel to spec |
| Title / main menu | Iteration stopped (asks had become taste) | 7.2 | `arcRail.js`, `screenLayouts.js` | Needs a rebuild on a geometry, not more skin (§5 lesson). Emblem, arc rail, Continue with save hull |
| Pause | Iteration stopped | 6.3 | same | Compact orbit ring of verbs; Resume as the primary verb |
| New game | Iteration stopped | 6.0 | `stopDial.js` (turntable) | Orbit carousel of hulls with arc-gauge stats; difficulty dial with the Hand |
| Crucible door / armory / refit / results | **Passed** | 8 / 8 / 8 / 8 | `screenLayouts.js`, `slotJig.js`, `hullSchematic.js`, `deathDial.js` | Door: HINGE crowding at 1280, launch glow. Keep them from regressing |
| Station shell (all 7 tabs share it) | **Passed** | 8 | `stationLayouts.js` | Services orbit ring round the name (ORRERY hub intent); a ring swing on tab arrival |
| Station Market | **Passed** | 8 | `marketLayouts.js` | 1280: dial over bright backdrop. 1920: empty lower-right. Name the one reason a trade is unavailable. Check the live total/verb in game |
| Station Shipworks (dock host) | Rebuilt on the jig; round 5 unscored | 7.5 (1920 judged pass-level) | `shipworksLayouts.js` + `hullSchematic.js` | Score round 5 first. 1280 numerals cluster (use the refit's eight-spot numeral rule). Compatible modules as an orbit carousel round the ship. Ghost arcs on the handling scales. **For Sale** mode not composed. Inertia scale lights nothing at 18 |
| Station Missions | Composed, **never critic-scored** | — | `stationTabsLayouts.js` | Score it. Dispatch-choice chevrons don't show. READINESS value sits indented. ORRERY intent: a mini-orrery with the route as a beam; Accept with a hold ring when collateral is at risk |
| Station Bar | Not started | — | add to `stationTabsLayouts.js` | Contacts rail, leads with INSPECT pills, intel rows, talk choices as words; portrait as cinema; comms waveform |
| Station Factions | Not started | — | same | Crest rail with bars and red/green tier numbers, standing ladder as a table, contract access list. ORRERY: 14 crests on an orbit ring, standing as arcs red→bone→amber |
| Station Industry | Not started | — | same | Blueprints with red names for "unavailable" (never red: that's not a threat), needs as table rows, "Needs refinery" as a filled primary. ORRERY: chains as beams between node glyphs |
| Station Ledger | Not started | — | same | Empty state is a sentence. ORRERY: ticker tape and arc summaries |
| THE SHIP (F2, flight host of the Shipworks stage) | Old sheet | — | `shipworksLayouts.js` scopes the dock host only | Extend the jig composition to `#sf-ship` |
| Chart / galaxy map | Not started | — | — | ORRERY §6 Chart: sectors on orbital tracks, lanes as beams, lens, route as the amber beam |
| Meta (tech tree, codex, mission log, settings) | Not started | — | — | ORRERY §6 Meta |
| Loading | Not started | — | `bootRing.js` exists | Emblem dial; the load's real stages as ticks; no developer copy |
| Comms / radials / confirm dialogs / toasts / Asteroid Works | Not started | — | — | Audit each with the same eye |

## 3. The library and the composition sheets

- `tokens.js`: `--dp-hand`, `--dp-ice`, `--dp-danger`, `.orr-svg` stroke classes. `injectOrrery(doc)`.
- `svg.js`: `svg()`, `polar()` (0° = up, clockwise), `arcD()`, `ticksD()`, `circularText()`
  (centre a word at `deg` with `startDeg = deg - 90`, or `deg + 90` upright).
- `instruments.js`: `arcGauge` (spring-driven, ghost on loss, segments), `orbitRing`, `hand`, `scale`.
- `motion.js`: springs. A settled spring re-set to the same target must not repaint.
- `text.js`: `decrypt()`, `createCounter()`. **Both are unused on the station so far; use them.**
- `hullSchematic.js`: the hull on its jig. Plan drawing in a dial, numbered nodes on the manifest's
  marks, labels on leaders in two columns, the fitted gauge and engraving, the rim Hand.
  `allowNone` lets a screen rest with nothing chosen.
- `slotJig.js`, `deathDial.js`, `stopDial.js` (`createStationRow`, `createTurntable`,
  `createStopScale`). **Split `stopDial.js` when you next touch it.**
- Composition sheets (CSS composed onto a screen's existing nodes, scoped by a root class):
  `screenLayouts.js` (Crucible, title, pause, new game), `stationLayouts.js` (the station shell and
  the vitals dial, `vitalDialSvg`/`setVitalDial`), `marketLayouts.js` (the Ladder, the quantity dial
  `qtyDialSvg`/`setQtyDial`/`qtyFromDialPoint`), `shipworksLayouts.js` (the jig host, the power dial
  `powerDialSvg`), `stationTabsLayouts.js` (Missions now; helpers `orreryRailCss`, `orreryCommitCss`,
  `orreryWordCss` for the rest).
- Produced art: `assets/ui/renders/hulls/` (hero/side/top/holo/**jig** per hull + manifest marks),
  station arts, crests. Tools in `tools/art/` (Blender 5.1, Freestyle `render_jig.py` → `jig_glyph.py`).
  Codex image generation works (see the memory note for the exact command).

The shared grammar every list-and-reading screen now follows:
- **The list is a Ladder.** One ruled rail, a tick per row, the shared notched Hand
  (`clip-path: polygon(0 0, 100% 50%, 0 100%, 26% 50%)`) on the chosen row. Bone at rest; amber
  while focus or the pointer is in the list.
- **The reading has no panel.** It sits on a pool of shade with soft edges, its figure in warm white,
  its terms as a ledger of caps and values in fixed columns.
- **The commit verb** is a bone word at 22px wide-800 caps that turns amber with an underline where
  the player reaches it.
- **Small verbs** are `› WORD PRICE` lines, never pills.
- **A preview** shows its change in ice: a ghost arc, `18t → 20t`, a one-line proposed fit.

## 4. The loop (exactly what worked)

1. Shoot: `node scripts/ui-bench.mjs --shot=<id>`, and again with `--viewport=1280x720`. Open the PNG
   yourself (`.devshots/ui-bench/<id>.png`) and read its measure lines: "ON TOP OF", "CUT OFF",
   "OFF FRAME". Screen ids are in `scripts/lib/uiBenchCatalog.mjs`
   (`station-market`, `station-shipworks`, …).
2. Measure what a still can't show:
   `VW=1280 VH=720 node scripts/ui-bench-eval.mjs <id> "<js>" [shot.png]`. Use it for computed
   styles, boxes, focus, or a state reached after a click. `window.__BENCH_STATE` and
   `window.__BENCH_BUS` let you change the state a mounted screen reads. Emit
   `economy:tradeCompleted` to make the station refresh.
3. Fix in the screen's composition sheet (preferred) or its markup builder. Keep every class, role
   and attribute that checks and tests read (grep `test/` and `scripts/` before renaming anything).
4. Critic: send the shots to a critic subagent (template in §6). Iterate until it scores ≥ 8 with no
   axis < 7. A skin caps at 6.5–7.5. When the critic says "the old panel with its box removed",
   rebuild on a geometry, as Shipworks was rebuilt on the jig.
5. Verify, then commit with exact paths (`git add -- <paths>` then `git commit -m … -- <paths>`), read
   `git show --stat HEAD`, and push. One commit per round.

Checks per area (run the ones the change touches):
- Station runtime checks need an **isolated store dir**: `SPACEFACE_PLAYER_STORE_DIR=<a temp dir>`. An
  empty string disables the store, and the undock save check then times out.
  - `node scripts/check-station-tab-navigation-runtime.mjs`: the whole dock walk.
  - `node scripts/check-market-first-loop-runtime.mjs`: a real purchase.
  - `node scripts/check-station-shell.mjs`, `node scripts/check-ui-native-titles.mjs`.
- `node --test test/station-*.test.mjs test/orbital-presentation.test.mjs test/station-hud-kit.test.mjs test/shipworks-dock-route.test.mjs`.
  Five station-folder tests are red for foreign reasons: the dock GLB contracts, economy contracts,
  chart notes, and shipworks 3D occlusion.
- `check-station-ui-temporal-stability.mjs` stalls (ledger D33). Don't wait on it.

## 5. Traps (each one cost a round or more)

- **One amber.** The Hand is the only amber at rest. Watch for kit amber leaking through: link
  underlines (`.sf-entity-link`), `k-signal` tags, lamp dots, active-tab underlines, filled lamp keys.
  Drawbacks are not threats, so never draw them red.
- **Specificity and order.** A later rule of equal specificity wins. A `:not([hidden])` on the base
  rule beats your media-query override. Double the class (`.a.a`) rather than guessing.
- **Kit leaks.** `fh-key` legend keys widen `font-variation-settings` on hover, which moves hitboxes;
  pin the face. Kit rows carry `min-height`/`height`; set `height:auto`. Kit flex children carry
  `flex:1 1 0`; set `flex:none`. Kit pseudo-elements keep painting boxes;
  `::before { all:unset !important; content:… }`.
- **A clipped pool is a box.** A radial shade inside an `overflow:auto` column gets cut into a
  rectangle. Mask its edges (two linear masks, `mask-composite: intersect`) or keep it inside the box.
- **Escapes.** `\203A` in a CSS template literal is an octal escape and kills the module; use the
  literal glyph. `\A` in a template literal becomes `A`; write `\\A`. Python heredocs through bash
  eat backslashes; write patch scripts with the Write tool. After every edit, run
  `node --check <file>`.
- **Test shims** lack `createElementNS`, `insertBefore`, `<template>.content`, `CSS.escape`, and
  `closest` in places. Guard, and fall back to a rebuild.
- **Rebuilt strings kill motion.** Anything re-rendered as innerHTML on a tick cannot transition. Patch
  in place: keyed rows, `setVitalDial`, `setQtyDial`.
- **The bench is not the game.** The bench has no economy (totals read "Unavailable") and no live 3D
  hull (the poster shows). Check live-only behaviour with the runtime checks.
- **The bench's cut-off heuristic** misreads `display:contents` parents; use flex or grid instead.
- **`hullSchematic` needs** a host of at least 480×320. Below that it stands down, so hide its labels
  when it is off.
- **Stale shots.** Re-shoot every screen you send to the critic from the same build. One round was
  wasted on shots taken before a fix.

## 6. Critic protocol

Spawn a general-purpose subagent (or resume the last critic if the session still has it) with:

> You are a harsh art director for a 2026 A-list space game. Score this screen against
> design/frontend/ORRERY.md: instruments of light over borderless glass, bone at rest, ONE amber Hand,
> ice only for data in motion, red only for threat, never recognisable as CSS (no cards, pills,
> table rows, boxes, link underlines). Axes: composition, hierarchy, legibility, ORRERY fidelity,
> craft/detail (+ interaction clarity when a state is shown). Pass = overall ≥ 8, no axis < 7. Give
> per-axis scores, the overall, and a ranked list of the defects that keep it under 8. For each
> defect give its pixel location and the concrete change. Shots: <paths at 1920 and 1280, plus any
> selected or hover state>.

Always send 1280×720 alongside 1920×1080, and include a selected or turning state for any
interactive instrument. Tell the critic what is a bench artefact.

## 7. Ranked backlog — do these in order, each to a critic pass

1. **Shipworks round 5 score.** Then fix the 1280 numeral cluster (eight-spot rule from the refit),
   compose **For Sale** (the hull on its jig or hero render, spec as a ledger, the price as the
   figure, Buy as the commit verb) and THE SHIP flight host.
2. **Missions**: first critic round. Then the route mini-orrery (here → destination as a beam in
   ice, jump hops as ticks), the dossier unfolding with `decrypt()`, and Accept with a hold ring
   when collateral is at risk.
3. **Bar, Factions, Industry, Ledger**: compose with `stationTabsLayouts.js` helpers first (rail, no
   panels, ledgers, commit verb), then give each its ORRERY hero instrument (§6 Station): Factions'
   crest orbit + standing arcs, Industry's production beams, Ledger's ticker + arc summaries, Bar's
   waveform + portrait cinema.
4. **Station motion.** Tabs arrive with a ring swing. Numerals roll with `createCounter` (credits,
   prices, rewards). Labels resolve with `decrypt()` on arrival. The purse ticks on a trade. All of
   it respects `html.sf-reduce-motion`.
5. **Title, Pause, New game**: rebuild on a geometry (they stalled at 6–7 as skins).
6. **Chart, Meta, Loading, THE SHIP, comms/radials/dialogs/toasts, Asteroid Works**: each from §6.
7. **Every screen at 2560×1440 and 1280×720**, and a keyboard/pad walk
   (`node scripts/ui-bench.mjs --shot=<id> --walk`) of every control on screens you changed.
8. **Composited-contrast audit** of small type (10px caps at 70% bone on the bright hangar truss
   was the recurring legibility hit).

## 8. Working rules that stay in force

- Owner rules (`~/.claude/CLAUDE.md`): finish the task; never ask the owner to judge technical
  risk; report in plain language.
- Repo rules (`AGENTS.md`): pathspec commits only; never sweep another lane's files; total-fix mode
  (fix small defects you see, log big ones as ONE row in
  `design/program/DEMO_READINESS_2026-09-20.md` §6).
- Never edit `*.expected.json`. No 45-minute runs. Review any subagent's code yourself before
  calling it done.
- Put new CSS in an ORRERY composition sheet, never in foreign-dirty `styles/*.css`. Check
  `git status --short` first.
