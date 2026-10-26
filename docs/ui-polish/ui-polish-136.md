# ui-polish-136 — Shipworks hull callouts clear the verb row at 1024–1100 × 640

**File:** `src/ui/orrery/shipworksLayouts.js` (added to the existing 901–1100 × 461–640 media block, CSS only). No selectors, IDs or markup changed.

## Problem (on master)
At 1024×640 and 1100×640 the live hull drawing (`.orr-sw-jig`) stacks four two-line callouts in its right column (~210px) in a ~200px band. The bottom one, `03 Vector Reaction Drive M / STOCK · M`, ran under TAKE THE HITCH TO THE RANGE · RECORD · PAINT and its state line was cut by the foot's fade. (ui-polish-131 called this "board mode"; it is the jig's own `.orr-sw-node` labels.)

## Fix
Inside the 901–1100 × 461–640 block: jig callouts put name and state on one line (`.orr-sw-node__body` as a row, tighter padding). The solver measures label heights live, so each column now stands in about half the height. The right column takes `max-content` width (capped at 300px) and grows away from the ring, so the long drive name reads in full.

## Checked
- ui-bench `station-shipworks`: 1100×640 findings 2 → 0, 1024×640 8 → 4 (the remaining 4 are the leftover below, same as master).
- Pixel Δ (>8) vs master: 0.00% at 960×540, 1100×700, 1280×720, 1920×1080, 390×844 (outside the query or no jig).
- `node scripts/check-type-floor.mjs` OK.
- Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish136/compare-{1100x640,1024x640}-shipworks.png`.

## Leftovers
- 1024×640: the identity line ("1/7 systems fitted · 0 t modules") runs onto the right column's `05` numeral. The identity isn't one of the solver's keep-outs; fixing it means adding it to `avoid()` in shipworks.js, which affects every size.
- 1024×640: two of the hull's pip markers hang below the ring toward the verb row.
