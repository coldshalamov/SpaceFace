# ui-polish-114 — Missions sheet: the reading gets room at 1024×768, the route lane fits at 960×540, the dial's verbs sit beside it at 640–760

File: `src/ui/orrery/archiveLayouts.js` (four media blocks appended to the Missions sheet). Selectors, IDs and markup unchanged.

**Before (master f39e8be966)**
- 1024×768 (and 1100×700): the hang kept 350px and the side column 220px, so the reading was ~290px. Terms values wrapped to four lines (PAYS, AUTHORIZATION), the title took three lines, and both route ends ellipsized (bench: 4 CUT OFF at 1024×768, 2 at 1100×700). At 1100×700 the route lane sat below the fold.
- 960×540: the reading ended at the fold; only the route band's THIS SECTOR · NO CLOCK line showed, the FROM/TO ends and the lane were below.
- 640–760 wide (720×700): the dial and its verbs shared one wrapping row, so TRACKED / OPEN ON THE CHART sat right on the dial's NO CLOCK reading and ABANDON dropped to its own line.

**After**
- 761–1100 wide, taller than 640: 300px hang, 150px dial in a 176px side column, so the reading is ~400px. Values wrap to two lines, the route ends use the two-row reflow (THIS SECTOR over FROM | TO) and nothing ellipsizes. At 1024×768 the whole lane is in frame.
- 901–1100 wide, ≤640 tall (960×540): 284px hang, one-line ledger labels at .1em tracking, tighter ledger rows, the route ends back on one row (FROM | THIS SECTOR | TO, names wrapping), 36px discs, and the stage runs into the bottom padding. The whole lane (both discs, the clock ticks) is now on screen with no scrolling. 761–900 (800×600) keeps the earlier band unchanged.
- 640–760 wide: dial on the left (no longer shrinks), verbs stacked in a column to its right, 34px under the dial for its NO CLOCK reading. At 640–700 the dial is 132px and OPEN ON THE CHART can wrap onto two lines rather than be cut.
- 390×844, 1280×720, 1920×1080: outside every new query, so they render as before.

**Checked:** bench `mission-log` at 390×844, 640×700, 720×700, 760×700, 800x600, 900×600, 960×540, 1024×768, 1100×700, 1280×720, 1920×1080. No findings anywhere (master had 4 CUT OFF at 1024×768 and 2 at 1100×700). Type floor OK. `mission-log-truthful-47a` 7/7.
Compare shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish114/compare-mission-log-*.png`.

**Leftovers:** at 1280×720 the TO end still ellipsizes ("Helios Station (Helios Prim…"), which the bench doesn't flag. At 1100×700 and 720×700 the lane discs are still just under the fold (the stage scrolls). The Game Over tape 8m 23s stop's hit box still overlaps the loss stop's at 1280/1920 (saveSortieTape.js).
