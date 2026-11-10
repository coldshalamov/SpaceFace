# ui-polish-155 — Market column fades instead of slicing a line (narrow tall windows)

**Before (390×844, 600×844, 520×900; `(max-width:650px) and (min-height:801px)`, desktop only):** the Market stage is one scrolling 150px column (dial, BUY / SELL, a pending decision, then the reading). Its scroll window ended with a hard cut, so the repair decision's terms were sliced mid-line ("Pay 22 cr. Hull 86 → 100," with the line under it half gone). It read as broken, not as "more below".

**After (`src/ui/orrery/marketLayouts.js`, inside the existing `NARROW_TALL` block only):** the column's foot fades over 20px, and 20px of bottom padding lets the last line of the reading scroll fully clear of the fade. Keyboard focus on REPAIR NOW still scrolls the whole decision into view, readable. 960×540, 1280×720 and 1920×1080 don't match the query and are unchanged. Selectors and IDs are unchanged. Type floor OK.

Shots: `ui-shots/polish155/` (`before/`, `iter1/`, `iter1scroll/` for scroll-end and focus).
