# ui-polish-157 — Bar: every reply reads at 960×540, and her words stop breaking into letters at 651–800

**Before (master f93e3f497e):**
- 801–1100 wide × 461–600 tall (e.g. 960×540): the Bar's reading stage is ~160px. Her words ran three lines in a ~200px column, so only "Answer the captain" read whole; "Ask about the yard" was cut by the stage's fade and "Take the Quiet message" sat below it.
- 651–800 wide × ≤800 tall (e.g. 800×600, 720×600): the words kept a fixed 330px reserve for the portrait, which left them a 38px column ("HUL / L / GHO / ST", "They / look") with the 300px portrait printed over them.

**After (`src/ui/orrery/stationTabsLayouts.js`, three new desktop-only blocks after the 960 berth block):**
- 801–1100 × 461–600: her words get `100% - 250px` (two lines, still clear of the voice arc and its reply dial), and the reply scale closes up (20px rows). All three replies read without a scroll at 960×540; 1024×600 the same.
- 651–800 × ≤800: the portrait steps down to 140px and the words get `100% - 200px`, clear of the arc's dial. The stage still scrolls (it's ~148px tall at 800×600), under its existing fade.
- 651–760 × ≤800: no face size leaves the words 120px, so the portrait (and the arc drawn on it) stands down and the words and replies take the stage's whole width. The roster still names her; the reply buttons are unchanged.

390×844, 1280×720 and 1920×1080 are outside every query: pixel Δ 0.00% vs master. Selectors, IDs and bar.js are unchanged. Type floor OK. Bench `station-bar` clean at 390×844, 960×540, 1280×720, 1920×1080, 800×600, 720×600. Tests: bar-authored-role-labels, station-field-hardware, ui-bench-control-reachability 32/32.

**Leftover:** at 760×420 and 700×460 the Bar stage is ~20px tall (the berth head takes the window; same on master).

Shots: `ui-shots/polish157/` (`before/`, `iter1/`–`iter3/`, `after/`, `compare-bar-{960x540,800x600}.png`).
