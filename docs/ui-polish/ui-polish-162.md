# ui-polish-162 — Market on short phones (≤650 wide, 601–800 tall)

**Problem (375×667, 414×736):** the narrow-phone Market rules only started at 801px tall, so short
phones fell back to the compact desktop berth: the register sat in a ~140px column with
"RAW ORE · LEGAL" set one letter per line beside it, the find field read "Find a c", the eight
families filled the whole list so no good showed, and BUY 1 sat under the tab strip.

**Change (`src/ui/orrery/marketLayouts.js` only):**
- The ≤650-wide narrow layout (and its ≤480 two-line register) now starts at 601px tall instead of 801.
- At ≤650 × 601–800 the families ride one line that scrolls sideways with a fade at the right edge,
  and the quantity dial, total and QUOTE BREAKDOWN set compactly so BUY 1 / SELL end inside the column.
- Under 390 wide the price indents 14px (was 30) so "33 ▼11%" no longer runs into the SELL number.

**Checked:** 375×667, 414×736, 600×700 improved; 390×844, 960×540, 1280×720, 1920×1080 pixel-identical.
Type floor OK.

**Leftovers:** at 600×700 and 360×640 the station header (hold reminder, mechanic line, dials)
leaves the Market stage under ~110px, so the console still scrolls; 360-wide price still touches SELL.
