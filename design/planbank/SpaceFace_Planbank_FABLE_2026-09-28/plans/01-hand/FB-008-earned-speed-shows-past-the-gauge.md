# FB-008 — The speed gauge shows overspeed the kernel deliberately preserves

**Kind:** polish · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: hud.js, seam: propulsionCatalog.js
**Write-set:** `src/ui/hud.js`, `test/fb-overspeed-band.test.mjs`
**Neighbours (extend, never restate):** SFQ-B013, NXI-013

## The gap
The speed gauge in `hud.js` clamps to `p.maxSpeed` (100%), so the earned momentum the propulsion kernel keeps
above the governed combat speed (`OVERCAP_ASSIST_BLEND_WU_S`) is invisible exactly when it was earned.
`resolveGovernedCombatSpeed` gives the reference number. Pure gauge work, hence the ORRERY lane.

## Why this direction
The sim half is done; the instrument lies by omission.

## Mechanism
- Paint an overspeed band on the gauge from |vel| − governed speed, in a second colour, without moving the 100%
  mark.
- Keep the 10 Hz numeric cadence the HUD already uses; no per-frame allocation.

## Done when
`test/fb-overspeed-band.test.mjs`: a seed-4242 slingshot release that exits above governed speed produces a
non-zero band value in the HUD model and zero once speed decays below it.

## Do not
Do not clamp or "settle" the number. Do not add a second gauge.

## Focus test starting points
- Locate the HUD gauge suites with `rg setKitGauge test/` (the gauge helper) and name what you verified.
