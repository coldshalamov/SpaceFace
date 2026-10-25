# ui-polish-127: station head and Missions dossier on 801–1140px-tall desktops

**Problem.** At 1920x1080, 1600x900 and 1440x900 the station head stacked the two station signs (bay screen, station wire) as four lines in the left column, while the column under the dials stood empty. That cost every station tab about 110px of body. On Missions, the dossier scrolls under its sticky ACCEPT band, so a four-term offer put COLLATERAL, FOLLOW-UP and READINESS under the key (the band's fade let them show through). At 1440x900 the 32px dossier title also wrapped to two lines.

**Fix.**
- `stationLayouts.js`: the short-window head (signs on one full-width band, next step tucked beside the dials) now also serves 1101+ wide × 801–1140 tall.
- `stationTabsLayouts.js` (min-width 1101, 801–1140 tall): the dossier closes up a little (reward `clamp(56px, 7vh, 80px)`, 6px term rows, tighter title/client/reward margins). Under 1500 wide the title is 26px so it stays on one line.

**Result (ui-bench findings, base → after).** station-contracts 1920x1080 6→0, 1440x900 6→0; station-dock 1920x1080 6→0, 1440x900 6→0; station-ledger 1920x1080 4→0, 1440x900 6→0; station-shipworks 1920x1080 2→0, 1440x900 11→2. Market shows four more commodity rows at 1920x1080. 1280x720, 960x540 and 390x844 are unchanged (media queries don't reach them; only animated pixels differ). 1600x900, 1280x800 and 1920x1200 Missions read 0.

**Review fixes (after Code Work's HOLD).**
- 1101–1280 × 801–1140: the five dials stay on one row (the ≤800 crown rule now reaches 1140 tall). Before, they towered 2·2·1 over the station wire and REARM at 1101x801.
- Shipworks verb row (TAKE THE HITCH / RECORD / PAINT): it's seated `position:fixed` and was only re-seated when the stage resized. Going 1101x801 → 1100x900 moves the stage without resizing it, so the row stayed at its old seat mid-dossier. `shipworks.js` now re-seats it on window resize too (only while Shipworks is showing).
- 801–1000 tall at 1101+: the reward (48px), its margins and the term rows (2px) close up again, so a live berth's five terms stand above ACCEPT at 1440x900.

- Second re-review (1101x801, 1100x900): the hull readings (439 TOP SPEED) drop just under the fleet roster when its wrapped STARTER SCOUT · T0 / ACTIVE row actually prints into them (measured on the row's type, so 1280x720 and 1440x900 stay put). The verb row now also re-seats while the station head settles after a resize (watched for up to 90 frames). The HITCH · 27.5 M caption sits above the shade pool at every desktop size, and the hull blurb folds at 1101–1280 × 801–1000 so it no longer runs under the Weapon/Thrusters/Utility callouts. Shipworks findings 1101x801 8→0, 1100x900 8→0, 1440x900 2→0; 1101x800, 1280x720, 1600x900, 1920x1080 stay 0.

**Leftovers.** Missions terms under ACCEPT at 1101x801 when the head note is long; the Starter dial at 1101x801 runs into the tab bar; Shipworks 960x540 Mining over the verb row (on master too); station-industry 1440x900 (6, unchanged); phone station tabs (15–29 each, unchanged); BUY behind UNDOCK at 1101x480; Shipworks 1280x540 clips.
