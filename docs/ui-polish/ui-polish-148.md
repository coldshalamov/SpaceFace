# ui-polish-148: Market at narrow, tall desktop windows (≤650 wide, 801+ tall)

Desktop only (`html:root:not([data-sf-mobile="1"])`); the phone layout is untouched.

## Found (600×844, 520×900, 390×844)
- The Market tab body is ~300–345px tall here, but none of the compact berth rules applied (they were scoped to ≤1100 × ≤800). The stacked 244px trade console stood past the right edge: the quantity dial, BUY / SELL and the total were off the glass, the reading stood one word per line, and the register showed one good (bench: 12–14 unreachable controls per size, 317–363 findings).

## Changed (`marketLayouts.js` only)
- The compact berth block is now a function run twice: as before for ≤1100 × ≤800, and desktop-scoped for `(max-width:650px) and (min-height:801px)`. The narrow-width register, quote and decision rules gain the same bucket.
- In that bucket the stage is one 150px column beside the register: the console (dial, total, BUY / SELL) on top, a pending decision under it, then the reading, scrolling together. The family strip wraps with 3px between lines.
- Under 481 wide each good reads on two lines: the name across the register, BUY / SELL / STOCK under it.

## Result
- 600×844, 520×900, 390×844: bench findings 317 / 358 / 363 → 0; dial, BUY and SELL on screen and reachable.
- 960×540, 1280×720, 1920×1080: pixel-identical to master.
- Type floor passes.

## Leftovers
- 390×844: the find field's placeholder clips to "Find a com"; the pending decision's first line ellipsizes.
- IMPACT LOGGED banner at 600×844; Bar questions below the fold under 481; Missions rows masked under 481.
