# ui-polish-142 — Missions route band: long berth names wrap instead of ellipsizing

**Screen:** Missions (mission log), route band under the contract terms.

**Problem:** at 1101px+ (1280×720 most visibly) the TO end of the route read
"Helios Station (Helios Prim…", cut mid-word by `text-overflow:ellipsis`.

**Fix (archiveLayouts.js, one `min-width:1101px` block):** the route ends wrap between place
names like the ≤1100 bands already do, the entity link stays on one line, and FROM / THIS SECTOR /
TO hang from a shared top line so a two-line berth doesn't drop the labels out of step.

**Checked:** 390×844 (unchanged, phone sheet), 960×540 (unchanged band), 1280×720 (berth wraps
to two lines, lane and ruler still clear Back), 1920×1080 (fits on one line, unchanged).
Re-checked the old "first row cut in half at 960×540" note: no longer reproduces on master.
