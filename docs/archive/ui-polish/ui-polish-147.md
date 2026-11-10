## Bar in a narrow, tall desktop window (ui-polish-147)

**Before (master 168838ed87):** at ≤650 wide and 801+ tall the contact rail kept its 360px column, so the reading got a ~190px strip. The contact's name set one syllable a line at 52px ("Capt / ain / Mae / ra / Vols"), and the memory line and the questions fell out of sight. Each row's role was cut off ("PILOT · NEW ARRIV"). Under 481 wide (390×844 desktop) the reading did not show at all.

**After (`stationTabsLayouts.js` only, desktop, ≤650 × 801+):**
- The rail and the reading share the width. Each contact's role stands under the name on its own line.
- The reading's head is a small grid: role and name (20px, whole words) beside a 56px portrait, the memory line full width under them at 13.5px. "Answer the captain" and "Ask about the yard" are on screen at 600×844.
- Under 481 wide the contacts stand over the reading (2:3), each scrolling, with tighter spacing and a 44px portrait.

No selector, ID or JS changes. Phones (`data-sf-mobile`) and 651+ wide are untouched.

**Checked:** bench `station-bar` at 390×844, 480×900, 600×844, 620×900, 640×1000 and 650×801: 0 findings (390×844 had 2 CUT OFF). 1920×1080 is pixel-identical; 960×540 and 1280×720 differ only in the animated tab-strip ticks. Type floor OK. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish147/`, `compare-bar-{600x844,390x844}.png`.

**Leftover:** under 481 wide the questions sit below the fold of the reading's scroller.
