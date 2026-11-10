# ui-polish-116: 960×540 Market BUY / SELL back on the board

## Problem
At 651–1100 × 461–600 (e.g. 960×540, 1024×600 is the edge) the Market stage is ~157px tall, but the
slim trade console (a 96px dial + its FEWER / MORE / MAX words, the total, `› QUOTE
BREAKDOWN` and the verbs) stood 190px. BUY 1 / SELL ended 33px below the stage, behind the berth's
UNDOCK key: not visible and not clickable (ui-bench: `"Market BUY Buy 1" … centre hit reaches
span.sxb-launch__label`, `"Market SELL Sell" … button.sxb-launch`).

## Fix (`src/ui/orrery/marketLayouts.js`, one desktop-only block)
`@media (min-width:651px) and (max-width:1100px) and (min-height:461px) and (max-height:600px)`:
- the quantity dial sets at 84px (number 22px, QUANTITY inside the ring, words under it),
- the total and the QUOTE BREAKDOWN line each take a single 15–17px line,
- the console rows close from 3px to 2px and the verbs from 26px to 24px tall.

The console now stands 156px in its 157px cell, so BUY 1 / SELL end inside the stage, above
UNDOCK. Nothing outside this range changes (the ≤460 scroll layout, phones, 1024×768 and wider
are untouched); no menu, loadout or HUD selectors.

## Viewports checked (ui-bench `--shot=station-market --walk`)
| viewport | controlReachability before → after | screenshot diff |
|---|---|---|
| 960×540 | 2 → 0 (BUY 1, SELL now hit themselves) | console only |
| 390×844 | 25 → 25 (phone swipe strip, pre-existing) | none |
| 1100×700 | 0 → 0 | none |
| 1280×720 | 0 → 0 | chart-tape animation only |
| 1920×1080 | 0 → 0 | none |

Walk at 960×540 after a buy (receipt line) and on long names (Machine Control Unit): verbs stay
visible and clear of the receipt and UNDOCK.

## Leftovers (not this branch)
- 960×540 analysis: on Machine Control Unit "AVG 215" prints over "14 SPREAD" (pre-existing).
- 390×844 phone Market: tab strip / swipe strip report as off-viewport (pre-existing, phone layout).
- >1100 wide × ≤600 tall (e.g. 1280×540) not checked.
