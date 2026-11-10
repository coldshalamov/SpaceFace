# ui-polish-134 — Automation at 960×540: DEPLOYED DRONES no longer on the bottom bracket

**Scope:** `src/ui/screens/automationPanel.js` (CSS only, one media block: 761–1100 wide × ≤580 tall).

**Problem.** At 960×540 the stacked head (gauge, flow strip, tab rail) and a three-row board card
(sentence, cost, button on its own line) pushed the DEPLOYED DRONES header down onto the panel's
bottom bracket, so the fold cut a section header in half and the empty-state note was off screen.

**Fix.** In that window only: the head's padding and gaps tighten, the board column widens a little
so the cost sits beside PLOT … again, and the body fades over its last 24px (with matching bottom
padding) so the fold reads as a scroll edge. No markup, selector, or data changes.

**Checked:** 960×540 and 1024×576 walk clean (0 findings); 1280×720, 1920×1080 and 390×844 are
outside the media query and unchanged. Type floor OK.

**Review fix (761×540 NET FLOW wrap):** the stat values now hold one line inside this band, and from 761 to 860 wide the four stat columns size to their values with 12px gutters, so NET FLOW reads "0 cr/min" on one line while the 340px board keeps its one-line cost and PLOT button. Bench: 0 findings at 761×540, 860×540, 960×540, 1280×720 and 390×844.
