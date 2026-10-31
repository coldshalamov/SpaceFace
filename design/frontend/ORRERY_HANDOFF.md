<!-- LIFETIME: ACTIVE_PROGRAM -->
# ORRERY handoff — historical frontend-pass notes

> **2026-10-30 (owner): the pass below produced screens judged sloppy; its numeric approvals are
> historical context, not current acceptance criteria.** Read [`STATION_STANDARD.md`](./STATION_STANDARD.md)
> and the amendment at the top of [`ORRERY.md`](./ORRERY.md). The no-border, no-table, arc-for-everything,
> and ≥ 8/10 rules below are retired. The backlog, old scores, multi-viewport quotas, and required
> signature-interaction rules are historical, not active work or quality verdicts. Use the current
> assignment and judge the screen's actual player experience.

Written 2026-09-23 at the end of an ORRERY session. It records status, implementation notes, and
ideas from that pass; it does not assign current work. Direction and ownership come from the active
Finish assignment and current visual guidance.

## 0. The job in one paragraph

This paragraph records the original 2026-09-23 direction; it is not current acceptance guidance. Its
borderless-only layout and numeric critic threshold were retired by the owner amendment above. Preserve
useful visual intent where it serves the screen, and follow the current assignment and Station Standard
guidance for present work.

## 1. References from the original pass

The earlier pass consulted [`ORRERY.md`](./ORRERY.md), [`docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md),
and existing modules in `src/ui/orrery/`. They remain useful technical references where they match
the current screen and assignment. The per-screen ideas and visual recipes below are optional, not
requirements to reproduce.

## 2. Historical status board (2026-09-28)

The following status and criteria are preserved as historical context, not current assignments or
acceptance requirements. The old thin-wire/signature-interaction score gate and measured band threshold
were retired by the owner amendment above. Use the active Finish board for current status and scope.
The table's action language records what was proposed at that time; it is not a live task list.
Latest critic report per surface: `design/frontend/review/reports/`. 31 surfaces approved — Wave 2
fully APPROVED (Ship 8.2, Range 8.3, Automation 8.0, Replay 8.1, Clips 8.0; RG7 closed). Wave 3 audit done
2026-09-28 (drill 3.0 / base 3.5 / sandbox 4.5 / loading 4.5†; orrery-flight 1.2 staging / flight 6.7 /
power-rail 7.1 / comms 4.2 / wingman 6.3); w3b build running (seeds + sites paint, HUD next).

| Screen | Then-current state | Historical score | Composition file at the time | Notes recorded then |
|---|---|---|---|---|
| Flight HUD (bench `orrery-flight`) | r1 ALL NOT PASSED: orrery 7.8 / flight 7.0 / rail 7.6 / comms 5.0 / wingman 7.7 (hud1-r1 + hud2-r1); recall-A running, recall-B queued | 7.8/7.0/7.6/5.0/7.7 | `flightPreview.js`, `hudSkin.js`, `hudAdapter.js`, `powerRail.js`, `commsRadial.js`, `wingmanRadial.js` | Recall-A: mount-time + T1-T7 + R1-R7 + C1-C6 + radar unit. Recall-B next: comms fan + wingman W-F. Fresh 1920 twins with mtime verification after. **2026-10-04: the Cluster's speed readout is now the Speed Dial** (`speedDial.js` replaced the hairline scale + loose numeral; owner brief "a real gauge that shifts colour with speed"). Not critic-scored yet: shoot `orrery-flight` and `flight` at 1920 and 1280, drive it with `window.__BENCH_CLUSTER.update({speed, speedRef, speedMax, boosting})` via `scripts/ui-bench-eval.mjs orrery-flight`. **2026-10-05: the comms fan and the wingman radial were restyled to the ORRERY language** (`commsLayouts.js`, `wingmanLayouts.js`: one feathered shade pool, arcs/words of light, bare numerals, bead-and-halo lamps, one Hand — the pointer's key is the only lit one; the per-frame drop-shadow filters are gone); the radar scope + contact roster were rebuilt the same day (chart-map pass). None of the four is critic-scored yet — re-shoot `comms-radial` / `wingman-radial` and send to the recall-B critic |
| Title / main menu | **APPROVED 8.3** (frontdoor-r2) | 8.3 | `arcRail.js` (`place`, `clearOf`, `freeTrack`), `screenLayouts.js`, `mainMenu.js` | Done; Pause unregressed |
| Pause | **APPROVED 8.3** (frontdoor-rs1) | 8.3 | `arcRail.js` (`grouped`), `pause.js`, `screenLayouts.js` | Polish only: 0% gauge 2px + bead, 1280 LOCAL MAP nudge, brief name bone .92 |
| New game | **APPROVED** (r7 8.2, both owner criteria): Spin the yard (`yardCarousel.js`, mass-weighted drag, stat arcs sweep between hulls), the difficulty stop-arc, the hull ring, the launch beat | **8.2 (r7)** | `yardCarousel.js`, `hullRing.js`, `stopDial.js`, `newGame.js`, `screenLayouts.js` | The form column's empty band (270 px at 1920); the Pelican poster is blockout (asset job) |
| Crucible door / armory / refit / results | **ALL APPROVED** (crucible-r2): door 8.2, draft 8.1, refit 8.3, results 8.3 (rs1, unregressed) | 8.2 / 8.1 / 8.3 / 8.3 | `screenLayouts.js`, `slotJig.js`, `hullSchematic.js`, `deathDial.js` | Done; suite carry-over per r2 report only |
| Station shell (all 7 tabs share it) | **APPROVED 8.0** (station3-r1, zero margin) | 8.0 | `stationLayouts.js` | Rail .27→.30 in tree; UNDOCK instrument + MUNITIONS band + thin dial numerals owed |
| Station Market | **APPROVED 8.0** (market-r1, on the line) | 8.0 | `marketLayouts.js`, `market.js` | Carry-over: right-edge scale + spread bracket wires (~1.6:1), CIVILIAN clip, AVG stub, bead knot, unlabeled 40 |
| Station Shipworks (dock host) | **APPROVED 8.1** (sw-r16); r17 landed (2334d326d: detents, centred hulls, lit view tag, rail part) | 8.1 | `shipworks.js`, `shipworksLayouts.js` | Not re-scored since r17; Pelican art (D72) |
| Station Missions | **APPROVED 8.2** (missions-r16) | 8.2 | `routeOrrery.js`, `contracts.js` | Beyond 8: YOURS void, beam glow heaviest, ring cores to §3.3 rest |
| Station Bar | **APPROVED 8.4** (bar-r17) | 8.4 | `waveform.js`, `barReplyDial.js`, `bar.js` | Beyond 8: lower-centre void, ladder tick spread |
| Station Factions | **APPROVED 8.1** (factions-rs1) | 8.1 | `crestOrbit.js`, `factions.js` | Beyond 8: hostile crest-track fills red per §6, Tilt Plate hero crest |
| Station Industry | **APPROVED 8.5** (industry-r16) | 8.5 | `chainBeam.js`, `industry.js`, `industryGlyphs.js`, `lampKey.js` | Beyond 8: ghost run ends on the missing thing; live-hold landing still |
| Station Ledger | **APPROVED 8.1** (station3-r1) | 8.1 | `ledgerTape.js`, `ledger.js` | Nits only (purse scale/dock, left void, 1280 axis) |
| THE SHIP (F2, flight host of the Shipworks stage) | **APPROVED 8.2** (shiprange-r3) | 8.2 | `shipworks.js`, `shipworksLayouts.js`, `station.css` | Carry-over: SH12 chooser divider rule-verb gap, SH13 band delta commas; slot-pick proof still on file |
| Range / Automation / Replay / Clips | Range **APPROVED 8.3** (shiprange-r3, RG7 closed); Automation **APPROVED 8.0** (automation-r2); Replay **APPROVED 8.1**, Clips **APPROVED 8.0** (replayclips-r1) | see left | `range.js`, `automationPanel.js`, `replay.js`, `clips.js` | Carry-over: range gauge-grow residual; automation link bodies 3.1:1 + rail-follow + focus segment; replay dormant band 3.5:1 + world exposure; clips ghost sub 16px + glyph bloom; populated stills when stageable |
| Chart / galaxy map | **APPROVED 8.1** (chart-r4); r5 polish landed (849a0a0dd) | 8.1 | `chartInstruments.js`, `chartLayouts.js`, `galaxyMap.js` presentation layer | **2026-10-04 map pass landed (not critic-scored):** ground/territory/fronts, dock, hub (hover card, menu, palette, toolbar, wire), inspector accordion; the canvas now receives real pointers (it never did). Radar: solid lit scope + class glow + glyph re-centre. Owed: persistent-critic round on `chart-galaxy`/`chart-route`/`chart-local` at 1920/1280/2560; system + local scales still draw on the old ground; orbital tracks + Lens remain optional |
| Meta | ALL APPROVED: Settings 8.1 / Credits 8.2 (setcr-r3); Save/Load 8.1 / Game Over 8.2 (sav-r3); Codex 8.1 / Mission Log 8.0 (archive-r4); Research 8.0 / Achievements 8.1 (con-r5); Help 8.0 (help-r4, r9 follow-ups landed) | see left | `settingsLayouts.js`, `saveLayouts.js`, `saveFilmstrip.js`, `saveBerth.js`, `saveSortieTape.js`, `archiveLayouts.js`, `archiveInstruments.js`, `constellation*.js` | Done |
| Loading | r1 7.7 NOT PASSED (wave3-sbld-r1; nearest to passing). **The r1 stills were the parked 2026-09-29 build, not master** (hero 96px numeral beside the ring, lattice field, ring-masked tableaux live only in `0d93c19a5`); master has the worker ring at 240px + the ELAPSED chrome. **2026-10-05:** the percentage is now Archivo 300 28px phosphor in fixed digit cells (worker + SVG fallback) | 7.7 | `bootRing.js`, `bootRingWorker.js`, `loadingPresenter.js`, `loadingSignalTableaux.js`, `loadingTerminalArt.js`, `styles/boot-instrument.css` | Owed vs r1: upper-field light (the baked video is the field now — decide whether it stays full-bleed or is ring-masked), a hero-scale numeral if the owner wants one, a leader tick ring→numeral. Re-shoot at 1920/1280 and send to the critic |
| Drill / Base / Sandbox | **2026-10-05 landed (not re-scored):** Drill = the parked Wave 3 chrome (arc gauges, staged unclaimed rock + one amber Stake-claim key, labelled Log key; theater check holds); Sandbox = the ladder (spine, ticks, faded scroll edge, N-setups foot counter) + a foot scrim so the pinned Launch key never covers text; Base = the exit keys (chart / Close / Dispatch) now stand at the plate bottom at every height (they used to scroll away). Last scores: Base r1 7.0 empty / 6.0 populated, Sandbox r1 6.4, Drill r3 pending | 7.0/6.0/6.4 | `asteroidScreen.js` + `styles/asteroid-ops.css`, `base.js`, `sandbox.js` + bench seeds | Re-score all three. Base still needs: a Dispatch Lamp Key state, selectable doctrines, a body plate behind the stat rows. Drill: the tool palette is still boxed keys; the cursor lens is a card |

## 3. The library and composition sheets (historical examples)

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

The earlier pass used a shared ladder, shade pool, and emphasized commit verb on several screens.
Those patterns may still be useful, but lists, panels, tables, buttons, and previews should fit each
screen's content and interaction rather than follow a common recipe.

## 4. Earlier iteration workflow (historical)

The commands below were used during that pass. Follow the current Finish Program's direct-check
guidance instead of treating this workflow, critic score, shot size, or commit cadence as a gate.

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
4. Earlier reviews used independent visual feedback and numeric scores. Those thresholds and round
   structure are retired; address concrete comprehension, control, accessibility, or visual defects.
5. Current verification and publication rules are in the repo instructions and Finish Program.

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

## 5. Implementation gotchas from the original pass

The code-level observations below came from that pass and may still help when the same implementation
pattern appears. The visual prescriptions are historical; current player clarity and the owner
amendment govern visual choices.

- **Historical palette note.** Earlier screens sometimes used amber too broadly or threat colors
  ambiguously. Diagnose the actual hierarchy and semantics before changing a surface; this is not a
  one-accent or one-control-per-screen rule.
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

## 6. Historical critic protocol (retired)

The September 2026 pass used repeated critic rounds and numeric axes. That experiment produced
little movement and is retained only to explain the old reports in the scratchpad. Current reviews
should identify concrete player-facing issues; there is no required critic, score, or round count.


## 7. Historical backlog and status notes

The status table and backlog in this document record the state of work in September 2026. Their scores,
"owed" items, phase ordering, and references to agents or critics do not describe current assignments.
Use the active Finish board and current implementation when checking present status.


## 8. Earlier working notes

These notes reflect the repo workflow at the time of writing. Current repository instructions and
the Finish Program supersede them.

- Owner rules (`~/.claude/CLAUDE.md`): finish the task; never ask the owner to judge technical
  risk; report in plain language.
- Repo rules (`AGENTS.md`): pathspec commits only; never sweep another lane's files; total-fix mode
  (fix small defects you see, log big ones as ONE row in
  `design/program/DEMO_READINESS_2026-09-20.md` §6).
- Never edit `*.expected.json`. No 45-minute runs. Review any subagent's code yourself before
  calling it done.
- Put new CSS in an ORRERY composition sheet, never in foreign-dirty `styles/*.css`. Check
  `git status --short` first.
