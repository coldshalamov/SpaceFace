# ui-polish-132 — Base identity-card verbs clear the foot band at 960×540

**File:** `src/ui/screens/base.js` (CSS only: one media query widened). No selectors, IDs or markup changed.

## Problem (on master)
At 960×540 the claimed Base plate scrolls and the foot band (ESC · CLOSE · DISPATCH CONVOY) covers the bottom of the first screen. The three Operating Identity cards wrap their consequence and tradeoff to two lines each, so each card's verb (CLEAR SITE STORAGE · ACTIVE) sat half under the band at scroll 0 and read as clipped.

## Fix
ui-polish-122's short-glass close-up (`max-height:580px`, stack gap 2px, slimmer plan padding and foot band) was limited to 1101+ wide. It now starts at 761 wide, so 960×540 gets the same treatment and every card verb sits fully above the band.

## Checked
- 960×540: all three verbs fully visible; nothing new peeks under the band.
- 1024×576: verbs clear; the next section's label sits above the band.
- 1280×540: pixel-identical to master (same rule as before).
- 390×844, 1280×720, 1920×1080 and 1366×600 are outside the query and unchanged.
- `node scripts/check-type-floor.mjs` OK.
