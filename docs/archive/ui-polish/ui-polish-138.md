# ui-polish-138 — Missions: the RECOMMENDED destination tag stays on its line

**File:** `src/ui/orrery/stationTabsLayouts.js` (two rules, CSS only, scoped to a badge that carries `.sx-ct-row__dest`). No selectors, IDs or markup changed.

## Problem (on master)
In the first hour a board row's badge carries its destination: `RECOMMENDED → CERES REFINERY · CERES BELT`. The badge is a one-line slot above the job title, so the tag wrapped and `BELT` printed on the title (Code Work's target from the #600 review; seen live at 1366x600). It wraps at every size under 1920 wide: 1366x600, 1280x720, 960x540 and 390x844 all overlapped.

## Fix
The badge keeps to one line: the tag's tracking tightens (.14em to .02em) so the whole route fits the ladder's 374px measure, and anything longer ends in an ellipsis instead of spilling. The full route stays in the row's label and the dossier. A two-line badge was tried first and rejected: the extra line pushed the job out of the short board window at 960x540 and hid FEATURED at 1366x600.

## Checked
Measured with the real `station-contracts` bench screen and the tag markup injected on the first row (the bench has no first-hour seed):
- 1366x600, 1280x720, 960x540: badge 35px to 17px tall, no overlap with the title, whole route visible.
- 1920x1080: no overlap before or after, whole route visible.
- 390x844: no overlap; the route ends `CERES B…` (340px measure).
- Rows without a tag are untouched (rules need `:has(.sx-ct-row__dest)`).
- `node scripts/check-type-floor.mjs` OK.
- Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish138/compare-*-missions-recommended.png`.

## Leftovers
- 960x540: the board window still cuts the first job row's title in half (on master too, with or without a tag).
