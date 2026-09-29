# FB-055 — Drones, traders, outposts and asteroid sites share one industrial output readout

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: automationPanel.js, seam: asteroidScreen.js
**Write-set:** `src/ui/screens/automationPanel.js`, `src/ui/asteroid/asteroidScreen.js`, `test/fb-industry-one-readout.test.mjs`
**Neighbours (extend, never restate):** SFQ-B090

## The gap
The automation panel (drones/traders/outposts) and the asteroid site screen are two unrelated industry
surfaces with no shared readout of total output. `describeProgrammedMinerOperation` already names the stage
that is stopping work; sites already compute lane capacity and thermal limits. Pure UI, hence the ORRERY lane;
the sim numbers exist.

## Why this direction
No empire screen: this is one line per asset (what it produces per day, and what is stopping it), not a
management view.

## Mechanism
- Add a shared industry summary model reading `state.automation` and `state.asteroidSites` (read-only) exposing
  per-asset output/day and the limiting stage.
- Render it at the top of the automation panel and the site screen as the same strip.
- Walk both screens with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-industry-one-readout.test.mjs`: the model sums a drone, a trader and a site from a seed-4242 save and
names each limiting stage; `automation-panel-focus.test.mjs` stays green.

## Do not
Do not compute output in the UI beyond summing. Do not add management verbs.

## Focus test starting points
- `test/automation-panel-focus.test.mjs`
- `test/asteroid-site-drawers.test.mjs`
