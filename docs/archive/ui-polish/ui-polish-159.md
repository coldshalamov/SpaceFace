# ui-polish-159: station screen on short phones (360×800, 375×667)

**Before:** under 801px tall the narrow-window station rules (≤650 wide) switched off and the short-desktop (≤800 tall) rules switched on, so a 360×800 or 375×667 phone got the desktop head: dials stacked one per row, the station title under the command trigger, the next-step card printed over the ad boards and COMMS / UNDOCK, and no Bar at all.

**Fix (stationLayouts.js, stationTabsLayouts.js, media queries only):**
- The ≤650 narrow-window blocks now start at 601px tall instead of 801px, and the matching short-desktop blocks are limited to 651px+ wide (or ≤600 tall), so the two never stack.
- Under 481 wide the dial labels and the CREDIT LINE OPEN word tighten their tracking so MUNITIONS stays inside the frame.

**Checked:** 360×800, 375×667, 390×844, 600×700, 960×540, 1280×720, 1920×1080 (Bar). Desktop sizes are unchanged.

**Left:** at 375×667 the Bar shows the first question in view (the stage scrolls); the Bar stage is still ~20px tall at 760×420 / 700×460.
