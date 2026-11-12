# G18-06 — Make the physical Textile Belt swings save time

In the corrected Hard seed-4242 fixture, Helios has six paired laps and a mean advantage of
0.248 s against the authored 0.8 s threshold. Mira qualifies both Quarry Hooks with zero gate
recoveries. Mira and Sable complete both Return Knuckle holds without the twelve loaded ticks
needed to qualify. A later Return Knuckle latch made every hold qualify but still measured
only 0.287 s. Removing the pre-crossing waypoint cap introduced aperture misses and broke
Mira's Quarry Hook qualification. Neither trial is in the runtime.

The lap-one trace locates the loss on the Quarry Hook exit, from zero-based gate 6 to gate 7.
Mira gains 0.333 s into the hook and loses 0.717 s out of it. Rook gains 0.117 s in and loses
0.283 s out. Both first-lap hooks have zero native spring-load ticks. The separating slack
line reports 17 positive damping estimates for Mira and 16 for Rook through the public
telemetry fallback. At the first such sample, the native joint spans 198 WU of 322 WU of
line for Mira and 195 WU of 323 WU for Rook. The first-lap exits therefore lose time without
a physical redirect. Check native load when comparing candidate approaches.

An ignored derivative reeled the Quarry ropes at the standard 69 WU/s rate before the apex.
Across the six holds, it shortened each rope by 58.65–73.60 WU and still applied zero native
spring-load ticks. All six paired lap times were identical to stock. The mean is still 0.248 s
and Mira still has two public qualification receipts and zero recoveries. The derivative is
`.devshots/fleet/g18-helios-reel.test.mjs` in the lead checkout.

Tune the anchor entry or rope-assisted steering so the line carries load while it can redirect
the rival onto the outgoing leg. Keep gate order, the standard attachment and real thrust.
Preserve Quarry Hook qualification on both laps, zero repeated timeouts and the 0.8 s threshold.
Do not alter control-arm pace, hazard clearance or the passing Veil and Tethys data.

The line is authored in `src/data/racingSetPieces.js`, steered by `src/ai/racingDriver.js`,
and qualified by `src/missions/racingOpponents.js`.
Use `node --test test/al-race-1-contested-line-4242.test.mjs` for the paired test.
