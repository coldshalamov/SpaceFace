# FB-007 — The drawn path is visible while it is flown and the stroke is graded when it ends

**Kind:** deepening · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: drawFlightInput.js, seam: drawFlightControl.js, seam: masslineHud.js
**Write-set:** `src/systems/drawFlightInput.js`, `src/core/flight/drawFlightControl.js`, `src/ui/masslineHud.js`, `test/fb-draw-to-fly-ink.test.mjs`
**Neighbours (extend, never restate):** SFQ-B004, SFQ-B011

## The gap
`emptyDrawFlightPath` keeps up to 256 stroke points and `drawFlightAcceleration` flies them, but no HUD
surface reads `state.input.drawFlightPath` and no grade is given. The player draws blind and learns nothing
from the result.

## Why this direction
A separate draw HUD was rejected; the massline HUD already paints world-anchored lines and previews. The grade
is a cross-track error the follower already computes implicitly.

## Mechanism
- Accumulate cross-track error and time-on-path in `drawFlightControl.js` while a stroke is being flown; publish
  a completed-stroke record with distance, peak speed and error band (razor/clean/good/rough) using the same
  band names as release rating.
- Paint the live stroke and the flown trace in `masslineHud.js` from `state.input.drawFlightPath`; fade the ink
  over 2 s after completion.
- Feed the band into the stunt callout so a razor stroke is named like a razor release (see FB-012).

## Done when
`test/fb-draw-to-fly-ink.test.mjs`: a scripted 12-point stroke on seed 4242 yields a deterministic error band
and the path buffer never exceeds 256 points; the HUD paints it (record from the HUD model, not a still).

## Do not
Do not change the follower's acceleration law. Do not add snapping to the drawn path. Do not add a draw
tutorial screen.

## Focus test starting points
- Locate the draw-flight suites with `rg drawFlight test/` and name what you verified.
