# ui-polish-119 — Game Over at short desktop windows

**Screen:** Game Over (`game-over`), 1280x540. File: `src/ui/orrery/gameOverLayouts.js` (CSS only, no selector/ID changes).

**Problem:** The 66px headline (5 lines) and 210px career ring pushed the primary CTA and the whole black-box tape below the frame. ui-bench: 6 OFF FRAME findings (all tape stops).

**Fix:** New `@media (min-width:1101px) and (max-height:640px)` block: headline 40px/24ch, ring radius 124px, recap height trimmed, tighter row gaps and padding, hub numeral 34px, tape 112px.

**Result:** 1280x540 went from 6 findings to 0. CTA, verbs and all tape stops are on screen. 1280x720 isn't matched by the rule, so it's unchanged (0 findings).

**Shots:** `ui-shots/polish119/compare-gameover-1280x540.png`, `after-gameover-1280x720.png`.

**Census at 1280x540 (20 non-station screens):** only game-over (6) and chart (1, HAZARD off frame) had findings. Chart is left for a later branch.
