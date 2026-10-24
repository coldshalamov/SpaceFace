# ui-polish-120 — Chart lens dock at short desktop windows

**Screen:** Chart (`chart`), 1280x540. File: `src/ui/orrery/chartLayouts.js` (CSS only, no selector/ID changes).

**Problem:** The collapsed lens dock's ten icon beads (32px each, 14px bank gaps) ran ~374px, so the last lens (Hazard) sank under the nav foot. ui-bench: 1 OFF FRAME finding ("HAZARD" is outside the frame).

**Fix:** New `@media (max-height:640px) and (min-width:1101px)` block for the collapsed wide dock only: bead min-height 28px, bank gap 6px, in-bank gap 0, list padding 2px.

**Result:** 1280x540 went from 1 finding to 0; all ten beads, including Hazard, sit above the foot. 1280x720 isn't matched by the rule (0 findings, pixel-identical rail).

**Shots:** `ui-shots/polish120/compare-chart-1280x540.png`, `compare-chart-1280x720.png`, `crop-rail-1280x540.png`.

**Checks:** type floor OK; galaxy-map inspector-stability and commodity-label tests pass (2/2).
