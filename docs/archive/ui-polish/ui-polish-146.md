# ui-polish-146: station at narrow, tall desktop windows (≤650 wide, 801+ tall)

Desktop only (`html:root:not([data-sf-mobile="1"])`); the phone layout is untouched.

## Found (600×844, Code Work's report)
- The berth head stacked five dials one per row plus both ad boards: 607px of an 844px frame. The tab body got 0px, so the Missions dossier (and its ACCEPT) could not be clicked.
- The destination words sat in a 182px side-scroller with each tab's gloss printed beneath it; six of seven tabs were off screen or under UNDOCK (bench: 6 unreachable tabs).

## Changed
- `stationLayouts.js`, `@media (max-width:650px) and (min-height:801px)`: the five dials share one row (verbs wrap under their dial, no chevron). The next step keeps title, count and DISMISS on one line with its sentence under it. The HULL MECHANIC note, berth and station news sit under it, two lines at most. The Bay screen and Station wire run as one-line signs side by side that scroll sideways. The destination words wrap above COMMS / HELP / UNDOCK, and only the open (or keyboard-focused) destination shows its gloss, on one line under the words.
- Under 481 wide the head scrolls past 40vh; everything above, including the next-step sentence, stays in it.
- `stationTabsLayouts.js`, same bucket: Missions board and dossier split the body in halves; the dossier is one scrolling column with ACCEPT at its head. The risk and standing scales stay in that column; the route ring is hidden (the destination is in the job title). YOURS entries put the title over its objective line, so they no longer print over each other. Under 481 the board stands over the dossier.

## Result
- 600×844: tab and ACCEPT unreachable findings 6 → 0; ACCEPT on screen. Bench per tab at 600×844 / 480×844 / 650×900 equals or beats the previous push (YOURS overlap 4 → 0 at 600×844); Market, Shipworks, Industry and Ledger findings are unchanged leftovers.
- 390×844 desktop: ACCEPT visible and reachable; bench reports no findings.
- 960×540, 1280×720, 1920×1080 and phone 390×844: outside the media query, no layout change (pixel compare).

## Leftovers
- Market at ≤650 × 801+: the trade instrument (BUY/SELL, quantity dial) still runs off the right edge (`marketLayouts.js`, separate branch).
- IMPACT LOGGED banner over Rig Workshop/Recovery at 600×844 (Code Work report).
- Bar at ≤650 × 801+: the contact portrait's name breaks mid-word ("Capt / ain"); Shipworks "Weapon" over DOCKED; Industry and Ledger clipped labels (pre-existing, unchanged).
- Under 481 × 801+ the Missions board rows are mostly masked; ACCEPT stays reachable.
