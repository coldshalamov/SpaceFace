# FB-134 — The docking corridor clears its far-quiet latch on the sector event the world actually emits

**Kind:** CHECK · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: dockingCorridor.js
**Write-set:** `src/systems/dockingCorridor.js`, `test/fb-corridor-sector-enter.test.mjs`
**Neighbours (extend, never restate):** SFQ-B004

## The gap
`src/systems/dockingCorridor.js` subscribes its far-quiet clear to `sector:entered`; the world emits
`sector:enter`. The clear-on-arrival never fires, so the corridor's far-quiet state can survive a jump into
Helios.

## Why this direction
Reproduce first, then a one-token fix with a test that pins the event name against the world's emit.

## Reproduction gate
- Reproduction gate: on seed 4242 set the far-quiet state in Ceres, jump to Helios, assert the corridor is still
  far-quiet on arrival (today).
- Fix: subscribe to `sector:enter`; keep `sector:exit`, `game:new`, `save:loaded`.
- Pin the reproduction as the test so a renamed event fails loudly.

## Done when
`test/fb-corridor-sector-enter.test.mjs`: far-quiet clears on arrival;
`docking-corridor-far-quiet-latch.test.mjs` stays green.

## Do not
Do not add a `sector:entered` alias to the world. Do not change the corridor's quiet radius.

## Focus test starting points
- `test/docking-corridor-far-quiet-latch.test.mjs`
- `test/station-docking-corridor.test.mjs`
