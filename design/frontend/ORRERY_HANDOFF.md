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

## 2. Status board (2026-09-25 midday)

| Screen | State | Last score | Composition file | What is left |
|---|---|---|---|---|
| Flight HUD (bench `orrery-flight`) | Phase 0a passed; live via `hudAdapter.js` | 8 | `flightPreview.js`, `hudSkin.js` | Live-route pass: ring brightness, orphan hairlines, objective dial. Radar/lock |
| Title / main menu | Iteration stopped (asks had become taste) | 7.2 | `arcRail.js`, `screenLayouts.js` | Needs a rebuild on a geometry, not more skin (§5 lesson) |
| Pause | Iteration stopped | 6.3 | same | Compact orbit ring of verbs; Resume as the primary verb |
| New game | Iteration stopped | 6.0 | `stopDial.js` (turntable) | Orbit carousel of hulls with arc-gauge stats; difficulty dial with the Hand |
| Crucible door / armory / refit / results | **Passed** | 8 / 8 / 8 / 8 | `screenLayouts.js`, `slotJig.js`, `hullSchematic.js`, `deathDial.js` | Door: HINGE crowding at 1280, launch glow. Refit still carries key caps (HOLD F·X, ENTER) — the station retired caps for dotted words; align |
| Station shell (all 7 tabs share it) | **Passed** | 8 | `stationLayouts.js` | Ring swing on tab arrival. Every tab critic names the shell's amber tab-rail cursor as a second amber mark: make it bone or phosphor |
| Station Market | **Passed** | 8 | `marketLayouts.js` | 1280: dial over bright backdrop. Name the one reason a trade is unavailable |
| Station Shipworks (dock host) | Round 11 landed (seven-segment fit dial, DOCKED verb, no mode bar, 720 sale wraps its hardpoints and folds its bars); r11 not yet scored | 7.0 (r10) | `shipworksLayouts.js` + `hullSchematic.js` | Named structural ask (r10 critic): the For Sale stage as an instrument, not a photograph on the world; the readouts as the last table; verbs in one home. 720 sale poster still sits 41px above its stage |
| Station Missions | Round 9 landed (THE TETHER: one line of light from the ACCEPT key across the glass into the orbit's origin, the route reading riding it; prices inline; one terms spine; junction bead; ring-clear rim names; 720 window snaps to a row) | 7.4 (r8) | `stationTabsLayouts.js`, `routeOrrery.js`, `contracts.js` (`layTether`) | Persistent critic alive (r8 report in the scratchpad): send the r9 stills to it, not a new one. Remaining from r8: DISPATCH weight, hold track, 720 RISK rung |
| Station Bar | Round 8 landed (voice trace on the spoken line, one lit cursor at rest, arm to its bead, unbroken spine, wash under the face, 720 lead titles clamp) | 7.1 (r7) | `stationTabsLayouts.js`, `waveform.js`, `bar.js` | r8 critic died on the session limit before scoring: relaunch with the "one structural change" ask (§6). Two critics disagreed on LEADS at the foot and on silhouette-vs-arc for the trace — let the next one rule |
| Station Factions | Round 7 landed (arm rises from the sun's ring and lands on an amber seat ring; no wells — a track stub either side of each zero tick; tier names on ONE baseline; brackets carry verbs and read away from the cursor; values clear the ticks) | 7.3 (r6) | `stationTabsLayouts.js`, `crestOrbit.js`, `factions.js` | Not yet scored. The watermark crest behind the numeral has never rendered (rect 0 at both sizes) — find out why before the critic does. 1280 names compact at 9px |
| Station Industry | Round 7 landed (THE RING AS THE GAUGE: run time as the thin numeral at the centre, the process name on the top arc, an open capped run track that progress fills; beams land flat on the track; blocked product at the ring's light; a way-out verb "Find a refinery on the chart"; key centred on the product axis; 1280 reason clear of the title) | 7.0 (r6) | `stationTabsLayouts.js`, `chainBeam.js`, `industry.js` | Persistent critic alive (r6 report in the scratchpad): send the r7 stills to it. r6 still owed: ladder foot ghost rung, extent cursor weight |
| Station Ledger | Round 7 landed (ONE linear scale both ways — no pedestal, debit majors where the stems say; the leader ends at the reading's first words with an end tick, not on the axis; the tape ends at NOW; 11px scale figures; signed lower figures; origin label off the axis; purse feet at 22px) | 7.7 (r6) | `stationTabsLayouts.js`, `ledgerTape.js` | Persistent critic alive (r6 report in the scratchpad): send the r7 stills to it. Its "memorable": a receipt posting should draw its stem up with settle, roll its figure, and sweep the purse |
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

Scores at midday 2026-09-25: Missions 7.4 (r8), Ledger 7.7 (r6), Factions 7.3 (r6), Bar 7.1 (r7),
Industry 7.0 (r6), Shipworks 7.0 (r10). The structural rounds are landed (§2 rows) and shot; none is
scored yet.

1. **Score the structural rounds with the critics that are alive** (Missions, Industry, Ledger:
   SendMessage with the r22 stills in `scratchpad/view/`); relaunch Bar with the §6 ask; spawn
   Factions and Shipworks critics with the §6 ask. Land each (A) if it names one more; then record.
2. **Factions watermark** (`.sx-fac-crest` in the overview) has never rendered — rect 0×0 at both
   sizes; the dpMark hero at `lit:false` may emit nothing visible. Fix before the critic looks.
3. **Shipworks 720 sale**: the poster sits 41px above its stage; the r10 critic's structural ask
   (the stage as an instrument) is still open.
4. **Station motion.** Tabs arrive with a ring swing. Numerals roll with `createCounter` (credits,
   prices, rewards). Labels resolve with `decrypt()` on arrival. The purse ticks on a trade; a
   receipt posting draws its stem with settle (Ledger critic's "memorable"). All of it respects
   `html.sf-reduce-motion`.
5. **Title, Pause, New game**: rebuild on a geometry (they stalled at 6–7 as skins).
6. **Chart, Meta, Loading, THE SHIP, comms/radials/dialogs/toasts, Asteroid Works**: each from §6 of
   ORRERY.md.
7. **2560×1440 is covered** by the shell's `zoom:1.25` rule (`stationLayouts.js`); re-check any tab
   whose column widths change. Walks ran clean on Bar, Factions, Ledger and Shipworks
   (`node scripts/ui-bench.mjs --shot=<id> --walk`); Missions and Industry walks are owed after their
   structural rounds (the tether and the way-out verb are new controls/overlays).
8. **Composited-contrast audit** of small type (`node scripts/ui-contrast.mjs --shot=<id>`).
9. **Deferred by design, still owed:** Shipworks exploded schematic (needs part art) and one dossier
   home; Factions RELATIONS as beams on the orbit + lore reveal; the tape's left end dissolving past
   the origin.

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
