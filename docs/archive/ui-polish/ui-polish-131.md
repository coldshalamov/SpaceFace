# ui-polish-131 — Shipworks callouts clear the verb row at 960×540

**File:** `src/ui/orrery/shipworksLayouts.js` (one new media block, CSS only). No selectors, IDs or markup changed.

## Problem (on master)
At 960×540 the Shipworks stage is ~160px tall and the centred verb row (TAKE THE HITCH TO THE RANGE · RECORD · PAINT) sits at its foot. The left column of two-line callout cards (Cargo · Weapon · Mining, name over OPEN / S) needed ~90px, so Mining's card printed straight over "THE RANGE".

## Fix
`@media (min-width:901px) and (max-width:1100px) and (min-height:461px) and (max-height:640px) and (hover:hover)`: callout cards go one-line (name and state share a 15px line), the same treatment already used at ≤460 tall. The solver measures cards live, so each column now stands in about half the height and clears the verb row. Board mode (`.is-board`) is untouched.

## Checked
- 960×540: walk findings 17 → 13; Mining, Weapon, Cargo all clear of the verbs; right column unchanged in position.
- 1024×600 and 1100×640 look clean (1100×640 opens in board mode, which this rule doesn't touch).
- 390×844, 1280×720, 1920×1080 are outside the query and unchanged.
- `node scripts/check-type-floor.mjs` OK.

## Leftovers
- 801–900 × 461–640 (e.g. 860×540): the verb row wraps to the right of the nameplate and the callouts tangle with DOCKED and the fit line — on master too, needs its own arrangement.
- 1100×640 board mode: the bottom-right "Vector Reaction Drive M / STOCK · M" card runs under the verb row.
