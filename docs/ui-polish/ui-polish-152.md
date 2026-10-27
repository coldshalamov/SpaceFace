# UI polish 152: Missions rows read on an upright phone

Phone portrait (under 481 wide, 801+ tall), Station Missions tab.

- Before: the board was a second scroller 42px tall inside the list half, so its edge fade masked the only posting in view, and YOURS sat over it. The dossier plate was also its own scroller, so the half showed ACCEPT and HOLD with the job's title faded out underneath.
- After: each half scrolls once. The board and the dossier plate stop scrolling on their own, so the list shows the first two postings whole, and the dossier opens on the job's kind and title, then ACCEPT and HOLD, with the terms scrolling below.
- Scope: the existing `@media (max-width:480px) and (min-height:801px)` contracts block in `src/ui/orrery/stationTabsLayouts.js`. No selectors or IDs changed.
- Checked: station-contracts at 390x844 and 414x896 (bench clean, no findings); 960x540, 1280x720 and 1920x1080 are outside the block and bench clean. Type floor OK.
