# ui-polish-126: Missions left column on short desktops

**Problem.** On desktops 801px tall or shorter (1101x700, 1152x648, 1280x540, 1366x600), the Missions tab pushed the YOURS block down toward the dossier tether's line, which sits below the column's own foot. Flex then took that space back from the tracked job (its "Tracked" word sliced off, or hidden entirely) and from the board, leaving a dead gap above YOURS. At 1280x540 the board showed no jobs at all.

**Fix.**
- `contracts.js`: the YOURS push toward the tether stops at the column's bottom edge.
- `stationTabsLayouts.js` (min-width 1101, max-height 800): the tracked job keeps its height, and the board window (which already scrolls and snaps to a whole row) gives up rows instead.

**Result (ui-bench station-contracts findings).** 1101x700 3→0, 1280x540 5→0, 1366x600 5→0, 1152x648 0, 1280x720 0 (the cut fourth board row now shows whole). 960x540 and 390x844 are pixel-identical. 1920x1080 differs only in the animated orrery; its 6 pre-existing "buried under ACCEPT HOLD" findings are unchanged.

**Leftovers.** 1920x1080 dossier terms under ACCEPT HOLD; phone Missions (15 findings, unchanged); BUY behind UNDOCK at 1101x480; phone Market overflow; Shipworks 1280x540 clips.
