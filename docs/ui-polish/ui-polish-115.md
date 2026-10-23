# ui-polish-115 — Game Over tape: one stop per moment, no overlapping hit boxes

**Before (master 555d37061c):** the black-box tape's keyboard/click stops are 22px buttons. The killing blow is also an event a second before the loss, so the far end had two stops stacked on the same spot (8m 23s and 8m 24s, both "Destroyed by …"): one of them could never be clicked and Tab/arrow keys walked through a duplicate. Close moments (launch, 9s, 24s) overlapped too. Overlap probe: 390×844 6, 960×540 3, 1280×720 2, 1920×1080 1 (the bench OVERLAP left open in ui-polish-111).

**After (`src/ui/orrery/saveSortieTape.js` only):**
- An event the tape leaves unmarked at the far end (within 40px, where "the kill owns the far end") folds into the loss's stop, so the stops match the marks you can see. Identical times collapse to one stop.
- Neighbouring stops split the gap between them, so each target is its own; stops with room keep the full 22px.

Overlap probe: 6/3/2/1 → 0 at 390×844 / 960×540 / 1280×720 / 1920×1080. Nothing drawn moves (tape crops match apart from the Hand's glow animation). Selectors and IDs unchanged. Type floor OK. Shots (not committed): `ui-shots/polish115/{before,after}/`, probe `_tools/go-stops.mjs`.

**Note:** on a phone a squeezed stop's focus ring is a narrow pill rather than a circle.

## Review round 2 (Oct 23)
- Code Work: at 390x844 the 40px far-end filter also dropped the 7m 44s Kill · Pirate stop. Now only the killing blow (the telegraph "It warned you", or anything in the loss's last second, within 40px of the end) folds into the loss stop; every other event keeps its own stop and its mark.
- Squeezed stops keep at least 12px wide and take half the channel's height, upper/lower alternating, so they never overlap.
- go-stops after: 8 stops at 390x844, 960x540, 1280x720, 1920x1080; 0 overlaps; min target width 12 / 17 / 20 / 22px.
- Merged origin/master. Compares: /workspace/spaceface-scratch/ui-shots/polish115r/compare-tape-*.png
