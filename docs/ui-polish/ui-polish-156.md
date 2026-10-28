# ui-polish-156 — Market family ladder fits at 960×540

**Before (651–1100 wide × 461–600 tall, e.g. 960×540, 1024×600):** the Station Exchange's family ladder (ALL STOCK … RESTRICTED, 8 rows at 17px = 136px) stood in a ~109px rail cell. MILITARY was sliced in half at the cell's foot and RESTRICTED sat hidden under it, out of reach.

**After (`src/ui/orrery/marketLayouts.js`, inside the existing 651–1100 × 461–600 block only):** the ladder rows close to 13px (type stays 12px, all caps, so nothing touches), so all eight families end inside the cell with ~5px to spare at 960×540. 390×844, 1280×720 and 1920×1080 use other layouts and are unchanged (filter positions measured identical). Selectors and IDs are unchanged. Type floor OK.

Shots: `ui-shots/polish156/` (`before/`, `iter1/` at 14px rows, `iter2/` final).
