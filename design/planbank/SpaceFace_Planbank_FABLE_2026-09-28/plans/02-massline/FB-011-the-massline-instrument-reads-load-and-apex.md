# FB-011 — The cadence readout shows load, stored swing energy, apex proximity and the arc exit numbers

**Kind:** polish · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: masslineCadenceReadout.js, seam: masslineTelemetry.js
**Write-set:** `src/ui/masslineCadenceReadout.js`, `test/fb-massline-readout-columns.test.mjs`
**Neighbours (extend, never restate):** SFQ-B026, SF-017

## The gap
`masslineTelemetry.js` computes `maxStrainSinceLatch`, `maxTangentialSpeedSinceLatch`,
`maxAngularSpeedSinceLatch`, `arcPreview.exitSpeed` and `arcPreview.timeToWhip` every tick and no UI or render
file reads them. `computeTetherLoad` and the apex ratio (`APEX_RELEASE_OMEGA_RATIO`) run in
`tetherGameplay.js`. The readout shows solution, phase and rest length only. Pure readout, hence the ORRERY
lane.

## Why this direction
The instrument fantasy needs the numbers that exist. No sim change.

## Mechanism
- Add columns: LOAD, ENERGY (stored swing energy band), APEX (ratio to release omega), EXIT (from
  `arcPreview.exitSpeed`), WHIP (countdown from `timeToWhip`).
- Keep the quiescent fast path in `masslineHud.js` (no work with no line).

## Done when
`test/fb-massline-readout-columns.test.mjs`: the readout model exposes the five values from a seed-4242 swing
and all are undefined with no line attached.

## Do not
Do not compute anything new in the UI. Do not change the readout's mount point.

## Focus test starting points
- `test/pq-158-02-massline-instrument.test.mjs`
