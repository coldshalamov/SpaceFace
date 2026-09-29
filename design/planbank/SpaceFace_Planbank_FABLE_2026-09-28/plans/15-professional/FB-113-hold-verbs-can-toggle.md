# FB-113 — Hold-only verbs can be toggled for players who cannot hold a key

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: input.js, seam: gameState.js
**Write-set:** `src/systems/input.js`, `src/core/gameState.js`, `src/ui/screens/settings.js`, `test/fb-hold-to-toggle.test.mjs`
**Neighbours (extend, never restate):** NXB-055, NXI-219, SFQ-B224

## The gap
Boost, brake, bullet time, the tether hold and reel are hold-only; holdToToggle has zero hits in `src/`.
`input.js` exposes only `held` sampling. A player who cannot sustain a press cannot use half the Hand. Editing
`input.js` needs task ownership plus focused input validation, named here.

## Why this direction
A per-verb accessibility option consulted where `.held` is read keeps raw axes and action semantics intact;
the toggle state lives beside the actions bag.

## Mechanism
- Add `+accessibility.holdToToggle` (off / per-verb set) consulted in `input.js` where held is derived: a press
  flips a latched flag that reads as held until the next press or a context change (dock, death, screen).
- Add the row under Access with the per-verb set.
- Pin that toggled boost reads as held across frames and clears on dock, and that raw `state.input.actions`
  edges are unchanged.

## Done when
`test/fb-hold-to-toggle.test.mjs`: latch, clear on dock, raw edges unchanged; `input-lifecycle.test.mjs` stays
green.

## Do not
Do not change any default. Do not alter action semantics for non-toggled verbs.

## Focus test starting points
- `test/input-lifecycle.test.mjs`
- `test/cinematic-input-fence.test.mjs`
