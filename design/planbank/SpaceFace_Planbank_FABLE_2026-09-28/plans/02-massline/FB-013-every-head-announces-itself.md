# FB-013 — The tractor, frame coupler, monofilament sweep and elastic whip heads have a status row, a first-use line and a distinct receipt

**Kind:** deepening · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: hud.js, seam: hudAttention.js, seam: tetherGameplay.js
**Write-set:** `src/ui/hud.js`, `src/ui/hudAttention.js`, `src/systems/tetherGameplay.js`, `test/fb-every-head-announces.test.mjs`

## The gap
`masslineCounters.js` authors six heads with tell and counter; all six are granted by modules. Only
`transverse_snare` and `twin_bridle` have a player-facing verb, a HUD status row (`masslineTetherStatus` in
`hud.js`) and a prompt. `tractor`, `frame_coupler`, `monofilament_sweep` and `elastic_whip` are spring
profiles the player fits and cannot see working.

## Why this direction
New verbs per head were rejected (the sweep's hostile cut and the whip's stored energy already are verbs in
the sim). What is missing is the announcement: a status row per head, one first-use line, and a receipt on the
head's defining moment.

## Mechanism
- Add head-keyed branches to `masslineTetherStatus`: tractor shows pull authority, coupler shows the rigid lock,
  sweep shows the cut arc armed, whip shows stored energy (from `whipStoredEnergy`).
- Add one `firstUseLine` per head in `hudAttention.js`, spoken on the head's first defining event (coupler lock,
  sweep cut, whip snap, tractor capture).
- Emit a distinct receipt on that event from `tetherGameplay.js` where none exists (the whip's is
  `tether:whipSnap`; the sweep's is `massline:sweepImpact`).

## Done when
`test/fb-every-head-announces.test.mjs`: fitting each of the four heads on seed 4242 yields the head's status
row and exactly one first-use line on its defining event; `massline-invariants.test.mjs` stays green.

## Do not
Do not change head physics (K values, cut arcs). Do not add a modal. Do not restyle the status row (ORRERY).

## Focus test starting points
- `test/massline-invariants.test.mjs`
- Locate head suites with `rg masslineHeadId test/`.
