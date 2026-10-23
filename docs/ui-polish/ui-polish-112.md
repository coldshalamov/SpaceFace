# ui-polish-112 — short desktop head and Market BUY (WIP)

- Problem: at 1100×700 and 1280×720 the station head ran ~290px of a 576px-scaled frame (bay screen and station wire stacked in the left column under the next step, right column under the dials empty), so the Market BUY key sat below/under the destination rail.
- WIP (stationLayouts.js, 901+ wide × 461–800 tall): the two signs share one band side by side under the mechanic's note; the next step moves to the right column under the dials.
- 1100×700: BUY 1 / SELL now on screen, register shows 8 rows instead of 4.
- Still open: 1280×720 BUY is half under the rail (console needs ~40px more or a smaller dial at ≤800 tall); the next-step block at right wraps DISMISS onto its own line; 960×540 not yet re-checked (also in the 901+ × ≤800 band); phone Market overflow untouched.
- Shots: /workspace/spaceface-scratch/ui-shots/polish112/{before,after1,after2,after3}.
