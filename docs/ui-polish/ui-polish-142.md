# ui-polish-142 — Missions route band: long berth names wrap instead of ellipsizing

**Screen:** Missions (mission log), route band under the contract terms.

**Problem:** at 1101px+ (1280×720 most visibly) the TO end of the route read
"Helios Station (Helios Prim…", cut mid-word by `text-overflow:ellipsis`.

**Fix (archiveLayouts.js, one `min-width:1101px` block):** the route ends wrap between place
names like the ≤1100 bands already do (balanced, so "Helios Station / (Helios Prime)" splits at the
parenthesis), and FROM / THIS SECTOR /
TO hang from a shared top line so a two-line berth doesn't drop the labels out of step.

**Checked:** 390×844 (unchanged, phone sheet), 960×540 (unchanged band), 1280×720 (berth wraps
to two lines, lane and ruler still clear Back), 1920×1080 (fits on one line, unchanged).
Re-checked the old "first row cut in half at 960×540" note: no longer reproduces on master.

**Review follow-up (Code Work HOLD):** the first cut kept each entity link `nowrap`, so at
1101–~1180px a long berth ("Ruined Cache Station") was hard-cut with no ellipsis. Dropped the
nowrap and added `text-wrap:balance`: every berth now wraps between words (probe clipX 0 at
1101/1180/1280/1440/1920, natural and stressed). At 1101×720 the longest berth takes three lines
and its last line sits below the stage's scroll edge; the stage scrolls (`k-stage--scroll`), as
it already did for the band on master.
