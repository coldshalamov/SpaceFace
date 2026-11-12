# G18-06 — Make the physical Textile Belt swings save time

In the corrected Hard seed-4242 fixture, Helios has six paired laps and a mean advantage of
0.248 s against the authored 0.8 s threshold. Mira qualifies both Quarry Hooks with zero gate
recoveries. Mira and Sable complete both Return Knuckle holds without the twelve loaded ticks
needed to qualify. A later Return Knuckle latch made every hold qualify but still measured
only 0.287 s. Removing the pre-crossing waypoint cap introduced aperture misses and broke
Mira's Quarry Hook qualification. Neither trial is in the runtime.

Trace the delta by gate on the existing two-lap fixture. Tune the anchor entry or rope-assisted
steering at the turn that loses time. Keep gate order, the standard attachment and real thrust.
Preserve Quarry Hook qualification on both laps, zero repeated timeouts and the 0.8 s threshold.
Do not alter control-arm pace, hazard clearance or the passing Veil and Tethys data.

Likely owners are `src/ai/racingDriver.js` and `src/data/racingSetPieces.js`.
Use `node --test test/al-race-1-contested-line-4242.test.mjs` for the paired test.
