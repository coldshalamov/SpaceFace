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

## Rework after Code Work handback

- **Real phones now get a fix.** Phones (`data-sf-mobile="1"`) use their own Market sheet in which the families already scroll sideways on one line and the register is stacked, so the desktop-scoped rules never applied to them. Their actual problem at 375×667 and 414×736 was that the berth header left the Market a ~128px area that scrolled separately from the header. A new phone-only block (`MP`, ≤600 × 561–800) makes the berth scroll as one page instead, which is what a phone on its side already does. The header, dials and Market read in order, and the tabs and Undock stay pinned at the foot, so BUY 1, SELL, the repair decision and the chart all show on one screen.
- **Desktop at 601–650 wide is back to master's layout.** `NARROW_TALL` is now `≤650 × ≥801` (master) plus `≤600 × ≥601`, and the short-window block starts at ≤600. 620×700 and 640×760 come out pixel-identical to master. 960×540, 1280×720 and 1920×1080 are unchanged (only sub-threshold chart-animation noise).
- Shots: `ui-shots/polish162b/compare-market-*.png`, with before on the left. The `p` suffix means real-phone mode.
