# ui-polish-112 — short desktop station head gives the Market its BUY key back

- Problem: from 901 wide on a short window (1100×700, 1280×720, 960×540) the station head ran ~230–290px: the two station signs stacked in narrow columns, the next step wrapped DISMISS onto its own line, and the right column under the dials stood empty. The Market's BUY 1 / SELL sat under the destination rail (1280×720) or below the fold (1100×700).
- Fix (stationLayouts.js, 901+ wide × 461–800 tall only): the next step tucks under the mechanic's note beside the dials, with title, count and DISMISS on one line and the sentence under. The two signs share one full-width band under the head, label and notice running on as one paragraph (two lines at most, one line at ≤600 tall).
- Result: BUY 1 / SELL fully on screen and clickable at 1100×700 and 1280×720 (bench reachability findings 2 → 0 at 1280×720). 1920×1080 and the phone are untouched (outside the band).
- Still open: at 960×540 the Market's BUY is still under the rail (the head is ~30px shorter, but the Market's own short layout needs work in marketLayouts.js); phone Market overflows to the right; the station-wire sign is hard to read over bright hangar backgrounds.

## Review round 2 (Oct 23)
- Code Work flagged the max-height:600px one-line sign clamp cutting sign text at 960x540 (Station 0→2, Market 2→4). Dropped it; signs keep the 2-line clamp from the 901+/461–800 band.
- Merged origin/master (#545 boot fix).
- ui-bench after: 960x540 Station 0, Market 2 (BUY/SELL centre hit under the rail, same as master — next fix). 1280x720 and 1100x700: 0/0.
- Compares: /workspace/spaceface-scratch/ui-shots/polish112r/compare-*.png
