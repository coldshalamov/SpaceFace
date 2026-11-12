# ui-polish-125 — Market BUY / SELL stay on the glass at 1101+ wide × 461–719 tall

**Screen:** Station Market tab, desktop, 1101+ wide × 461–719 tall. File: `src/ui/orrery/marketLayouts.js` (CSS only, two new media blocks under the existing `MD` prefix, no selector/ID changes).

**Problem:** At ≤880 tall the trade console stacks dial (204px), total (71), BUY/SELL (46) and the quote breakdown (33), ~375px in all, but the body is only H − 355px tall. At 1152×648 BUY/SELL sat under UNDOCK (centre hit reached the launch label). At 1280×540 and 1366×600 they fell below the glass or into the foot bar, along with FEWER / MORE / MAX.

**Fix:**
- `@media (min-width:1101px) and (min-height:461px) and (max-height:719px)`: the console becomes a two-column grid. A 108px dial sits beside the total stack (TOTAL COST, the number, and HOLD n / 40 u as one line; the hold arc graphic sleeps). FEWER / MORE / MAX run across under both, then the note, BUY/SELL and QUOTE BREAKDOWN. About 210px tall.
- `@media (min-width:1101px) and (min-height:461px) and (max-height:600px)`: 88px dial (the QUANTITY caption sleeps; the input keeps its aria-label), 24px total, 36px BUY, a tighter refusal note and breakdown summary. About 184px with a refusal note showing, which fits the 185px body at 1280×540.
- 720 tall and up keep the stacked console unchanged.

**Result (ui-bench station-market --walk, master → branch, `_assets-7c9ab`):**

| size | arrival findings | total (with walk) |
|---|---|---|
| 1152×648 | 2 → 0 | 65 → 19 |
| 1280×540 | 7 → 0 | 187 → 19 |
| 1366×600 | 2 → 0 | 101 → 19 |
| 960×540 | 0 → 0 | 17 → 17 (pixel-identical) |
| 1280×720 | 0 → 0 | 17 → 17 (pixel-identical) |
| 1920×1080 | 0 → 0 | 18 → 18 (pixel-identical) |
| 390×844 | 29 → 29 | 635 → 635 (pixel-identical, phone layout untouched) |

Also checked after only: 1101×700 and 1600×700 are clean.

**Leftovers:** At 1101×480 (body ~125px) BUY/SELL still reach the UNDOCK key; ≤~520 tall needs a different arrangement. The 390×844 Market phone layout runs off-screen (tabs, BUY/SELL, qty dial). Shipworks 1280×540 body clips. Missions "Tracked" clip at 1101×700 and 1280×540.

**Shots (not committed):** `ui-shots/polish125/{before,after}/<size>/station-market*.png`.
