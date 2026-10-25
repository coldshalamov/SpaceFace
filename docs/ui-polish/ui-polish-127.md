# ui-polish-127: station head and Missions dossier on 801–1140px-tall desktops

**Problem.** At 1920x1080, 1600x900 and 1440x900 the station head stacked the two station signs (bay screen, station wire) as four lines in the left column, while the column under the dials stood empty. That cost every station tab about 110px of body. On Missions, the dossier scrolls under its sticky ACCEPT band, so a four-term offer put COLLATERAL, FOLLOW-UP and READINESS under the key (the band's fade let them show through). At 1440x900 the 32px dossier title also wrapped to two lines.

**Fix.**
- `stationLayouts.js`: the short-window head (signs on one full-width band, next step tucked beside the dials) now also serves 1101+ wide × 801–1140 tall.
- `stationTabsLayouts.js` (min-width 1101, 801–1140 tall): the dossier closes up a little (reward `clamp(56px, 7vh, 80px)`, 6px term rows, tighter title/client/reward margins). Under 1500 wide the title is 26px so it stays on one line.

**Result (ui-bench findings, base → after).** station-contracts 1920x1080 6→0, 1440x900 6→0; station-dock 1920x1080 6→0, 1440x900 6→0; station-ledger 1920x1080 4→0, 1440x900 6→0; station-shipworks 1920x1080 2→0, 1440x900 11→2. Market shows four more commodity rows at 1920x1080. 1280x720, 960x540 and 390x844 are unchanged (media queries don't reach them; only animated pixels differ). 1600x900, 1280x800 and 1920x1200 Missions read 0.

**Leftovers.** station-industry 1440x900 (6, unchanged); phone station tabs (15–29 each, unchanged); BUY behind UNDOCK at 1101x480; Shipworks 1280x540 clips.
