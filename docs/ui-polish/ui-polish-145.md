# ui-polish-145 — Codex reading thumb @960 and phone dial labels

Scope: `src/ui/orrery/archiveLayouts.js` only. Selectors and IDs are unchanged.

**Before**
- 960×540 (desktop): the reading's scroll-extent thumb (`.orr-extent::before`, left 7px inside the content box) drew a 2px bar through "01", the filing line and the first letter of every body line. The old fix (left −10px) only covered ≤460px tall.
- Phone portrait (390×844, 360×780): the seven unlock dials sat in 48px cells with `overflow-wrap:anywhere`, so their words broke mid-letter (STOR / Y, COMM / S, GRAF / FITI, ENDG / AME). DISCOVERIES ran past the left edge of the 118px section column.
- Phone landscape (844×390): DISCOVERIES lost its first letters in the 104px column.

**After**
- The thumb rides the reading's 14px left gutter at every desktop size.
- Phone portrait: each dial cell sizes to its word, on one line at 12px with a condensed width (wdth 76), so the dial row is one line shorter. Under 340px wide (320×568) the one row would be 310px in a 306px space, so the row wraps and centers there and SURVEY stays on screen. Section tabs use .06em tracking (was .1em), so DISCOVERIES fits.
- Phone landscape: the dial/word pairs stay packed (no spread from the portrait rule), the section column is 116px and tracking is .06em, so every section name is whole.

Checked: 960×540, 1024×768, 1100×640, 1280×720, 1920×1080, and phone 390×844, 360×780 and 844×390. At 1280 and 1920 the thumb also moves 17px into the gutter; nothing else moves. 320×568 and 340×600 show all seven dials. The type floor passes, and the codex tests pass (`fb-codex-world-tab`, `pulse-437-codex-pages`, `weight-archive-527`). Shots: `ui-shots/polish145/{before,after}/`, `compare-*.png`.
