# ui-polish-150: Market find field at 390×844 (desktop ≤480 wide, 801+ tall)

Desktop only (`html:root:not([data-sf-mobile="1"])`); the phone layout is untouched.

## Found (390×844)
- The find field stood absolutely positioned beside the STATION EXCHANGE legend at ~70px wide, so its placeholder read "Find a com" and the legend broke onto two lines.

## Changed (`marketLayouts.js` only, inside the existing `(max-width:480px) and (min-height:801px)` block)
- The browser grid gains a row: legend, then the find on its own full-width line, then the family strip, then the register.
- The legend closes up to .12em so STATION EXCHANGE stays on one line; that pays for the find's row.

## Result
- 390×844: placeholder reads "Find a commodity" in full; legend on one line (letter-spacing .12em); the register keeps the same two rows on screen. Bench walk clean at 390×844 and 600×844; 960×540, 1280×720, 1920×1080 measured clean.
- Wider sizes are outside the media query and unchanged. Type floor passes.

## Leftovers
- IMPACT LOGGED banner at 600×844; Bar questions below the fold under 481; Missions rows masked under 481.
