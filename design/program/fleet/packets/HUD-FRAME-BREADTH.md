# HUD-FRAME-BREADTH: finish the flight HUD's frame cost with three patterns

Written by the HUD performance engineer, 2026-11-22. Worked examples are commits `2c3f59d130`,
`3bd866f75d`, `8d9df85da8`, `22c0661ccd` on master. Read those diffs first: this packet asks for
the same three moves at the sites that are left, nothing new.

## Goal (milestone 1)

Ricochet Foundry (`helios_core`), Swarm round 6, 30 Hz presentation: everything under
`uiRoot.frame` costs at most 4 ms per presented frame, and no forced layout over 5 ms anywhere
under `src/ui` while flying. The HUD shows the same information and looks the same.

Where it stands (one probe run, switches off then on, same seed, about 6 frames a second on the
test laptop; one pair only, the second "on" run never started its round):

| row | off | on |
|---|---|---|
| UI part of the frame (`frames.ui` p50) | 37.3 ms | 8.1 ms |
| `frame src/ui/uiRoot.js` | 32.3 ms/frame | 8.7 ms/frame |
| work moved after layout (`(anon) src/ui/hudAvoidRects.js`, the observer callback) | 0 | 6.4 ms/frame |
| frame callback p50 | 98 ms | 66.5 ms |

So about 15 ms a frame is left. The rows that hold it, largest first (ms per frame in the "on"
run): `placeReceiptLane` 3.7 (of which `queryReceiptGeometry` 2.6 and `freeOverlayBands` 1.9),
`placeOrdinaryCaptionInSafeBands` 2.9, `pickAt` in `worldObjectInteraction.js` 1.9,
`refreshFlightTextObstacleSnapshot` 1.7, the scope repaint 1.7, `updateCombatHud` 1.4,
`readRectRows` 1.3. `querySelectorAll` is still 4.1 ms a frame in total: remove that first.

## The three patterns

**1. Read geometry after layout, never inside the frame.** `afterLayout(doc, fn)` in
`src/ui/hudAvoidRects.js` runs `fn` in the same frame, right after the browser's own layout pass
(a ResizeObserver slot), where rectangles and computed styles are already known and cost nothing.
A read inside the frame callback, after any HUD write, lays the whole page out on the spot
(5-118 ms measured). Rules:

- A job that only reads (obstacle rects, clip boxes): keep the last value, ask for a refresh with
  `afterLayout`, use the old value this frame. See `createRectSnapshot` and `cachedMarkClipBox`.
- A job that writes then reads (text placement): run the whole job in `afterLayout`. See
  `flushReceiptLaneAfterLayout` in `src/ui/hud.js`.
- `afterLayout` returns false where there is no ResizeObserver (tests): then do the old direct
  read. Every caller keeps a patience fallback (250-400 ms) for a window that is not rendering.
- Restarting a CSS animation: remove the class and add it again in the next animation frame;
  never `void el.offsetWidth`. See the refused-card shake in `src/ui/screens/crucible.js`.

**2. Never search the page per frame.** Mounted panels are found once and kept while
`isConnected`; live containers (`#toasts`, `#alerts`, `.sf-sj__col`) are walked through
`children`, guarded by `childElementCount`. A selector list over `document` or `#hud` scans every
mounted screen. See `hudStructure` and `selectorNodes` (hudAvoidRects.js), `ml2ThrowCueElement`
(worldObjectInteraction.js), `higherWorldPromptActive` (masslineHud.js).

**3. Work that only has to be recent goes on the 'hud' scheduler.** `hud.frameTasks` is
`createFrameTaskScheduler({ name: 'hud', budgetMs: 1.5 })` (`src/core/frameTaskScheduler.js`,
read its header). Register a job with a wanted rate; call the handle's `request()` when its
input changes sharply (new target, hull hit). `hud.frame` runs the scheduler once, last, when the
main UI frame drives it (`deferReceiptPlacement === true`); a bare `hud.frame(dt)` keeps the old
clocks, which is what the tests use. Worked jobs: `scope` (15 Hz), `target-card` (20 Hz),
`contact-roster` (5 Hz). Keep jobs small: the worst frame is the largest job plus one starving
job. Anything pinned to a moving body (reticle, brackets, edge arrows, floor-pad labels,
floating numbers) stays every frame and writes only `transform`.

Canvas text: no `font =`, `measureText`, `fillText` or `strokeText` on a canvas that is in the
document. Measure on a detached canvas, draw the words once into a detached sprite, blit. Numbers
that tick are built from one-character sprites. See `textSprite` and `collectLabelRuns` in
`src/ui/map/flightMinimap.js`.

Every change sits behind a live switch so it can be measured against itself
(`frameCostFixOn('<name>')` from `src/render/frameCostSwitches.js`; existing names `hudText`,
`hudRects`, `hudLayout`, `hudTasks`; use `hudBreadth` for this packet's work).

## Sites, in this order

The full list is `.devshots/director/fable/audits/ui-layout-reads.txt`. Take the rows marked
`per-frame` for these files, FORCED-LAYOUT rows first. Station, asteroid and field-build screens
belong to another session: leave them. Another agent working from
`design/overhaul/14_PERF_PLAN.md` is editing `hud.js`, `floatingText.js`, `threatHalo.js`,
`toasts.js` and `alerts.js`: read the file's current state before each edit and do not repeat a
cache it already added.

1. `src/ui/hud.js` (62 per-frame rows). `placeReceiptLane`, `freeOverlayBands`,
   `placeOrdinaryCaptionInSafeBands`, `placeAlertLaneInSafeBands`, `overlaySafeSlot`,
   `refreshFlightTextObstacleSnapshot`, `responsiveOverlayObstacles`, `objectiveEdgeObstacles`:
   pattern 2 for every `querySelectorAll`, `querySelector` and `getElementById` (find once, keep
   while connected; a state selector such as `.sf-tell.is-on` becomes a kept list of `.sf-tell`
   filtered by class), and keep the caption's `scrollHeight` by (text, width). Then put the
   10 Hz numeric block of `frame()` on the scheduler as three small jobs: readouts (cargo bar,
   fork, ion storm, tether), mission tracker, context row. `updateTravelTape`,
   `orreryCluster.update` and `updateCombatHud` take a `slow` flag: split their slow half into a
   function the job calls; do not call them twice a frame.
2. `src/ui/worldObjectInteraction.js` `pickAt` (a scene raycast): one `hover-pick` job at 8 Hz,
   `request()` on a pointer jump over 48 px.
3. `src/ui/floatingText.js` `syncPadLabels` and `collectPadHudObstacles` (up to 11 ms a frame
   with the switches off): split "which pad expands, label text, seat solve" (job, 10 Hz) from
   "write each visible pad's transform" (every frame). Do not throttle the whole pass: the labels
   are pinned to the floor and must move with the camera every frame.
4. `src/ui/masslineHud.js` `_updateAcquisitionPreview`, `collectLiveHudPanelRects`,
   `placeHudBracketWords` (8 rows): pattern 1 for the rects, a 15 Hz job for the preview solve.
5. `src/ui/threatHalo.js` and `updateContactMarks` in `src/ui/hud.js`: decide which marks exist
   on a 15 Hz job; write their transforms every frame.
6. Smaller per-frame rows: `src/ui/input.js` (22), `discoveryPlate.js` (6), `toasts.js` (5),
   `uiRoot.js` (5: `syncModalChrome`, the flight cursor), `promptDeck.js` (4), `comms.js` (4;
   `attentionGateActive` runs `document.querySelector` per frame), `alerts.js`
   (`suppressEntrance` reads `getComputedStyle`), `racingHud.js` (3), `pilotCards.js` (3),
   `capitalBossOverlayMount.js`, `swarmJuiceHud.js`, `survivalHud.js`.
7. `src/ui/radar.js`, the old (non-chart) draw path: `g.font` and `fillText('N')` on the attached
   canvas; use the canvas-text pattern.
8. After milestone 1: the screens that open mid-run (level-up cards, shop, death screen, round
   summary) must each open without a main-thread block over 50 ms: build their DOM ahead of time
   or in slices. `deathDial.js` and `typeGovernor.js` already measure after layout.

## How to verify each step

- Tests: `node --test` on the files that import what you touched (never the whole suite).
  Compare against the failures that already exist on master before your change; add none. With
  the switches forced off (`node --import ./.devshots/frame-cost/rfxoff.mjs --test ...`, a
  one-line file that sets `globalThis.__sfRfx`) the same tests must give the same result.
- Look: `node scripts/fleet/game-lock.mjs run -- node scripts/ui-bench.mjs --shot=flight,crucibleHud`
  before and after; open both PNGs. `--walk` any screen you changed.
- Measure, one invocation, off and on:
  `node scripts/fleet/game-lock.mjs run -- node scripts/probe-frame-cost.mjs --route=swarm --round=6 --arena=helios_core --secs=24 --profile=1 --variants="off:rfx=-hudBreadth;on:" --reps=2 --tag=hud-breadth`
  Read `frames.ui` and the `src/ui/` rows of `profile.inclusive` in
  `.devshots/frame-cost/hud-breadth/*.json`; divide a row by that run's fps for ms per frame.
  Add the post-layout row (`(anon) src/ui/hudAvoidRects.js`; also `globalThis.__SF_HUD_POST_LAYOUT__`)
  to the frame row: work moved after layout still counts. Throw away a run whose `calls.p50` is 0
  (the round never started). `globalThis.__SF_FRAME_TASKS__()` lists each job's cost and lateness.
- Done when: `frame src/ui/uiRoot.js` plus the post-layout row is at or under 4 ms per frame in
  the "on" runs; `querySelectorAll`, `querySelector`, `getBoundingClientRect`, `get scrollHeight`
  and `getComputedStyle` are gone from the profile's top rows; the stills match.
- Commit each step when it measures better and looks right, with the numbers in plain words.
  For a file another agent is editing: `bash scripts/fleet/own-commit.sh begin <file>` before
  you edit, `bash scripts/fleet/own-commit.sh commit "<message>" <files>` after.
