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

## 2. Status board (2026-09-25 late night)

| Screen | State | Last score | Composition file | What is left |
|---|---|---|---|---|
| Flight HUD (bench `orrery-flight`) | Phase 0a passed; live via `hudAdapter.js` | 8 | `flightPreview.js`, `hudSkin.js` | Live-route pass: ring brightness, orphan hairlines, objective dial. Radar/lock |
| Title / main menu | **Passed** (r3 8.1): the emblem behind the logotype, one knockout round the name and kicker, the head lifted over the dial's pool | **8.1 (r3)** | `arcRail.js` (`place`, `clearOf`), `screenLayouts.js`, `mainMenu.js` | A planet node cut by the knockout's top edge at 1920 (cosmetic) |
| Pause | **Passed** (r3 8.0): seven stops, the Hand's row lights its legend, a smaller dial clear of the key strip, the brief's readings in phosphor | **8.0 (r3)** | `arcRail.js` (`grouped`), `pause.js`, `screenLayouts.js` | The pentagon rock on the dial face; small labels at 2560 |
| New game | r1-rebuild scored 7.1 (the title plate put a hauler behind the chosen hull); r2 landed its own bare backdrop (render_title_backdrop.py `bare` → backdrop-newgame.jpg), the hull at zoom 1.55, the craft items | 7.1 (r1 rebuild) | `hullRing.js`, `stopDial.js`, `newGame.js`, `screenLayouts.js` | r2 in critic (`frontdoor-r4-critic.txt`) |
| Crucible door / armory / refit / results | **Passed** | 8 / 8 / 8 / 8 | `screenLayouts.js`, `slotJig.js`, `hullSchematic.js`, `deathDial.js` | Door: HINGE crowding at 1280, launch glow. Refit still carries key caps (HOLD F·X, ENTER) — the station retired caps for dotted words; align |
| Station shell (all 7 tabs share it) | **Passed** | 8 | `stationLayouts.js` | Ring swing on tab arrival. Every tab critic names the shell's amber tab-rail cursor as a second amber mark: make it bone or phosphor |
| Station Market | **Passed** | 8 | `marketLayouts.js` | 1280: dial over bright backdrop. Name the one reason a trade is unavailable |
| Station Shipworks (dock host) | r12 scored 7.3 (the 720 For Sale disc is the model; 1920 still a photograph); r13 (the 1920 stage as the 720 one, one ring box for both modes, readout wraps, one verb row, view marks on the ring) is with a builder | 7.3 (r12) | `shipworks.js`, `shipworksLayouts.js` | Score r13 with the same critic |
| Station Missions | **Passed** (r13 8.07) — r14 landed the critic's defects (the landing tick is two notches outside the berth ring, whole-pixel tick phases, 8px air round the destination, leaders cross no name) | **8.07 (r13)** | `routeOrrery.js`, `contracts.js`, `stationTabsLayouts.js` | Beyond 8: the ice pulse along the tether; section ticks at the glyph centre |
| Station Bar | **Passed** (r13 8.1) — r14 landed the polish (the spine clamped to its box, arm/bead/tick from one number) | **8.1 (r13)** | `waveform.js`, `bar.js`, `stationTabsLayouts.js` | Beyond 8: content in the lower centre (the contact's standing as an arc under the replies) |
| Station Factions | **Passed** (r10 8.0) — then r11 landed the critic's margin items (graduations and future rung words over 4.5:1, the next rung's word above its detail, the cursor broken across the tier word) | **8.0 (r10)** | `crestOrbit.js`, `factions.js`, `stationTabsLayouts.js` | Beyond 8: the chosen crest large on a Tilt Plate with its lore scroll-revealed (§6); the 1280 scale widened for tier gaps |
| Station Industry | **Passed** (r12 8.1) — r13 landed the must-fix (a list that fits reports it fits) and the polish (header separator, ticks on names, augment rungs name what they consume) | **8.1 (r12)** | `chainBeam.js`, `industry.js`, `lampKey.js` (rim on whole pixels), `stationTabsLayouts.js` | — |
| Station Ledger | **Passed** (r8 8.0, r9 8.1) | **8.1 (r9)** | `ledgerTape.js`, `stationTabsLayouts.js`, `ledger.js` (the reading's figure rolls) | Nits only (leader mid-run weight under the reading's glass, the 1280 axis column). Motion: a posting receipt drawing its stem with settle |
| THE SHIP (F2, flight host of the Shipworks stage) | Old sheet | — | `shipworksLayouts.js` scopes the dock host only | Extend the jig composition to `#sf-ship` |
| Chart / galaxy map | Not started | — | — | ORRERY §6 Chart: sectors on orbital tracks, lanes as beams, lens, route as the amber beam |
| Meta (tech tree, codex, mission log, settings) | Not started | — | — | ORRERY §6 Meta |
| Loading | Not started | — | `bootRing.js` exists | Emblem dial; the load's real stages as ticks; no developer copy |
| Comms / radials / confirm dialogs / toasts / Asteroid Works | Not started | — | — | Audit each with the same eye. The trade toast overprints UNDOCK at 1280 (Ledger critic) |

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
- **The Read tool caches a PNG by path.** Reading `.devshots/ui-bench/x.png` twice in one session
  can show the earlier picture. Copy the still to a fresh name (`scratchpad/view/r11-x.png`) before
  opening it, or read the bench's probe numbers first.
- **A library pseudo-element keeps its own transform.** `.orr-route::before` is `width:118%` with
  `translate(-50%,-50%)`; a composition rule that only sets `inset` inherits that translate and the
  disc slides half its width away (420px left, over the Missions title, dimming its right half for
  three rounds). When you re-box a library pseudo-element, set `transform`, `width` and `height` too.
  Bisect a mystery dim/bright region with `display:none` on candidates; `elementsFromPoint` skips
  `pointer-events:none` elements and every pseudo-element, so it cannot find such overlays.
- **An absolutely positioned grid child uses its grid area as its containing block.** A leftover
  `grid-row:9` on `.sx-fab-foot` put the Industry key 1,100px below its plate. Set `grid-area:auto`
  when you switch a grid child to absolute positioning.
- **Crest art carries a dark plate.** The generated emblems sit on near-black hex shields; on the
  glass they read as avatar chips. `mix-blend-mode:screen` on the `<img>` leaves only the light.
- **A `mask` on an ancestor makes it a backdrop root.** A `backdrop-filter` inside a masked wrapper
  blurs only the wrapper's own content, never the world behind it; put the blur on a sibling or on
  the masked element itself.
- **The critic's "two left edges" was a two-column grid** (crest | words) in a kit panel: measure
  `display` and `gridTemplateColumns` on the parent before hunting margins.
- **Never assume `rungs`, `rows` or `labels` fit:** assign rows right to left so a rung is one row
  deeper than the deepest rung inside its own word's run; break words at their space into two
  lines. Three fixed rows collided every round.

## 6. Critic protocol (revised 2026-09-25 — the version that converges)

Five to eight rounds per tab moved every score by 0.1–0.3. Three causes, all in the protocol: a fresh
critic each round re-ranked ten new items from zero (it could not see movement); the ask was "ten
ranked fixes" so ten came back every time; and the six craft items got landed while the one
structural item got skipped. The revised loop:

1. **One critic per tab, kept alive.** Spawn it once with the shared brief
   (`scratchpad/critic-brief.md`: the law in short, the axes, the artefacts to ignore, the report
   format). For the next round SEND IT the new stills with `SendMessage` ("your nine items — here are
   the stills; score the movement") instead of spawning a new one. It keeps its own numbers.
2. **The ask.** After the axis scores and the item-by-item check of the previous list: (A) THE ONE
   STRUCTURAL CHANGE that carries the tab from its score to 8.0 — one paragraph, concrete; (B) the
   FEWEST craft items (≤ 5) so no axis is under 7.0. Not a list of ten.
3. **Land (A) first**, then (B). Shoot 1920 and 1280 plus the states. Send back. One persistent
   round per tab; if it is still under 8, record the score and the critic's named structural ask in §2
   and move the door — the rest of the backlog is owed too.
4. Tell the critic what is a bench artefact (the foot toast, CYCLE 0001, frozen motion, the hold at
   46%) and never re-shoot for it: it scores the stills it is given.

Reports live beside the session scratchpad as `<tab>-r<n>-critic.txt`.

## 7. Ranked backlog — do these in order, each to a persistent-critic pass

Scores late on 2026-09-25: **Ledger 8.1, Factions 8.0, Missions 8.07, Industry 8.1, Bar 8.1 — all PASSED**;
Shipworks 7.3 (r12, r13 with a builder); Title 7.1 / Pause 6.7 / New game 6.4 were round-1 scores before
their rebuilds (r2 in critic). Critic reports: `scratchpad/<tab>-r<n>-critic.txt`, `frontdoor-r<n>-critic.txt`.

1. **Close the front door**: Title (8.1) and Pause (8.0) PASSED; New game r2 in critic.
   Score Shipworks r13 with the Shipworks critic.
2. (Done: the New Game launch key carries its word; the rebuild is in.)
3. **Station motion.** Tabs arrive with a ring swing. Numerals roll with `createCounter` (credits,
   prices, rewards). Labels resolve with `decrypt()` on arrival. The Missions tether carries an ice
   pulse from the chosen row through the key into the origin; the Factions chords draw origin → crest
   with the pulse, rivals last; the Ledger stem draws with settle and the purse sweeps on a receipt; the
   Bar voice arc breathes with the line. All of it respects `html.sf-reduce-motion`.
4. (Done 2026-09-25 late: Title, Pause and New game are rebuilt on geometries; see item 1.)
5. **Meta** (Settings/Credits, Save/Load/Game over, Codex/Mission log, Research/Achievements) is with four
   builder agents (shared brief `scratchpad/builder-brief.md`, each with its own composition module). Then
   **Chart** (galaxyMap.js, 9.6k lines, canvas-drawn; its sector rings wear faction colours that collide with the
   Hand's amber), Loading, THE SHIP, comms/radials/dialogs/toasts, Asteroid Works: each from §6 of ORRERY.md. Stills of title/pause/new-game/chart/ship at both sizes are in `.devshots/ui-bench/`.
6. **2560×1440 is covered** by the shell's `zoom:1.25` rule; re-check the Missions tether and the
   Shipworks verbs (both seated with `position:fixed` from page coordinates). Walks ran clean on
   Missions and Industry on 2026-09-25 (42 / 46 controls, every picture changed; the "(unlabeled)"
   rows are the bench's own hidden input, not a control).
7. **Composited-contrast audit** of small type (`node scripts/ui-contrast.mjs --shot=<id>`).
8. **Deferred by design, still owed:** Shipworks exploded schematic (needs part art) and the live
   render framed by the ring; Factions RELATIONS detail as an unfold; the tape's left end dissolving
   past the origin.

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
