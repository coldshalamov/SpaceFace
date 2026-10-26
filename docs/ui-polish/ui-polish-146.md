# ui-polish-146: station at narrow, tall desktop windows (≤650 wide, 801+ tall)

Desktop only (`html:root:not([data-sf-mobile="1"])`); the phone layout is untouched.

## Found (600×844, Code Work's report)
- The berth head stacked five dials one per row plus both ad boards: 607px of an 844px frame. The tab body got 0px, so the Missions dossier (and its ACCEPT) could not be clicked.
- The destination words sat in a 182px side-scroller with each tab's gloss printed beneath it; six of seven tabs were off screen or under UNDOCK (bench: 6 unreachable tabs).

## Changed
- `stationLayouts.js`, `@media (max-width:650px) and (min-height:801px)`: the five dials share one row (verbs wrap under their dial, no chevron), the ad boards and shift note step aside, the next-step title stays on one line, and the destination words wrap above COMMS / HELP / UNDOCK with their glosses hidden.
- Under 481 wide the head scrolls past 40vh and the next step shows its title only.
- `stationTabsLayouts.js`, same bucket: Missions board and dossier split the body in halves; the dossier is one scrolling column with ACCEPT at its head (route ring and scales hidden here). Under 481 the board stands over the dossier.

## Result
- 600×844: tab and ACCEPT unreachable findings 6 → 0; ACCEPT at y≈461.
- 390×844 desktop: ACCEPT visible and reachable; bench reports no findings.
- 960×540, 1280×720, 1920×1080: outside the media query, no layout change.

## Leftovers
- Market at ≤650 × 801+: the trade instrument (BUY/SELL, quantity dial) still runs off the right edge (`marketLayouts.js`, separate branch).
- IMPACT LOGGED banner over Rig Workshop/Recovery at 600×844 (Code Work report).
