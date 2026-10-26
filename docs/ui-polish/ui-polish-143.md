# ui-polish-143 — New Game: first-15-minutes titles wrap at 701–1100px

**Before:** on desktop windows 701–1100px wide, the four route beats share a 380–560px stage, so each title
ellipsized ("Wake at t…", "Tether the dereli…") at 800×900 and 960×540.

**Change:** `src/ui/orrery/newGameLayouts.js`, one `(min-width:701px) and (max-width:1100px)` block (desktop only,
`html:not([data-sf-mobile="1"])`). Beat titles wrap under their bead (balanced) instead of ellipsizing, and the
gap between beats tightens from 24px to 16px so they fit on one line from ~960px wide. No markup, selector or
data changes. 390×844, 1280×720 and 1920×1080 are outside the query and unchanged.

**Checked:** 800×900 (two balanced lines), 960×540, 1024×768, 1100×800 (one line, no overflow). Type floor OK.

**Leftover:** at 701–800px wide (800×900) the ring's right reading (5.5k LINE, "massline winch speed") runs off
the frame, and the hero render sits over the loadout list.
