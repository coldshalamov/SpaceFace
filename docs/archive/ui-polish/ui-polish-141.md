# ui-polish-141: Credits at wide windows — the wordmark clears the ring and the whole orbit fits

**Before (master a6038291b7):** above 1500px wide the orrery hung off the right edge (`right:-4vw`, 80vh across), so body 04 at 3 o'clock and its number were cut by the window edge, and the 660px reel ran into the ring: at 1920×1080 the SPACEFACE wordmark's last letter sat on the ring's outer rim and the TYPE credits ("OMNIBUS-TYPE", "MATHIEU TRIAY") printed over the ring's lower-left arc.

**After (`src/ui/orrery/settingsLayouts.js`, one `@media (min-width:1501px)` block, CSS only):** the orrery is `min(70vh, 760px)` across and hangs only 4% of itself past the edge, so all six bodies and their numbers are inside the window; the reel is capped at 540px and the wordmark at `clamp(56px, 7vh, 80px)`, so both end well short of the rim. Windows at 1500px and narrower are unchanged. No selector, ID or markup changes.

**Checked:** ui-bench `credits --walk` at 390×844, 960×540, 1280×720, 1600×900, 1920×1080 (plus 2560×1440 still): 0 findings everywhere, walk results identical to master. Type floor OK. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish141/` (`compare-1920x1080-*.png`).
