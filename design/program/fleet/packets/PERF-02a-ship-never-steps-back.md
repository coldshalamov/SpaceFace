# PERF-02a — Your ship never steps backwards on screen

**Program:** B Performance (`PLAYBOOK.md` §3B). **Tier:** D (lead reviews numbers). **Size:** medium.

## The owner's words (2026-11-10)
"When I'm flying it looks like a snake's tongue flicking, because the ship is jumping forward and
hitching backwards — flicking forward and backward constantly." Same on the iPhone (a better GPU), so
it is not the graphics chip.

## Cause (lead diagnosis)
The simulation runs in a worker and is drawn from its snapshots, which arrive 2–10 times a second when
the worker is busy (it runs at 0.62× real time even in the quiet opening). Between snapshots the
presentation (`src/render/snapshotFence.js`) extrapolates the ship forward (up to
`PRESENTATION_EXTRAPOLATION_S` = 150 ms); when the real snapshot lands behind the guess, the drawn
pose is re-derived from the new bracket and **jumps back**. Nothing smooths that correction for the
player's own ship, and the camera follows the ship, so the whole view flicks.

## Build
1. **Measure first.** In `scripts/probe-smooth-flight.mjs` add a metric **`playerBackSteps`**: per
   presented frame, the player ship's drawn position (the mesh the camera follows — read it the way the
   probe reads other presented values) projected on its own velocity direction; count frames where it
   moved **backwards by more than 0.5 world units**, and the largest backward step. Also count
   **`playerForwardJumps`**: frames whose forward step is more than 2.5× the median step. Print both in
   the probe's summary. Run the probe **three times** before any change; record the numbers.
2. **Fix: error smoothing for the player ship.** New pure module `src/render/poseContinuity.js`:
   keep, per entity, the last drawn position and a smoothed velocity. Each frame, given the fence's raw
   presented position `r`: expected = lastDrawn + velocity·dt; jump = r − expected. If |jump| is larger
   than a small threshold (start at 0.5 WU), absorb it into an offset `o -= jump`; draw `r + o`; decay
   `o *= exp(−dt / 0.12 s)`; if |o| exceeds 40 WU (a real teleport: respawn, dock, warp, sector change),
   reset `o = 0` and draw `r`. Apply it at the one place the renderer writes the **player** ship's
   presented position (find it from `presentedAnchorXZ` in `src/render/presentedAnchor.js` and
   `syncEntityViews` in `src/render/renderer.js`), so the camera and everything attached to the ship
   follow the smoothed pose. Heading: same treatment on the yaw angle (wrap-aware), threshold 2°.
   Presentation only — never write back to the sim or the entity's sim fields.
3. **Measure again,** three runs, same flags. Then run the E1 fence tests
   (`node --test test/*fence*.test.mjs test/*playout*.test.mjs test/*presented*.test.mjs`) and
   `npm run check:playable`.

## Done when
Median `playerBackSteps` across three runs drops to **0** (or by at least 90 %), `playerForwardJumps`
drops by at least half, and the checks pass. Report all six runs' numbers in a table.

## Files you may edit
`scripts/probe-smooth-flight.mjs`, new `src/render/poseContinuity.js`, the single renderer call site
(name it), new `test/pose-continuity.test.mjs` (pure tests: a backward snap is absorbed and decays; a
40 WU teleport resets; steady motion passes through unchanged). `git diff` first.

Commit: `fleet(PERF-02a): the player's ship never steps backwards on screen`.
