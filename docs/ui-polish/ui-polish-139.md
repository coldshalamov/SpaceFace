# ui-polish-139: Credits orrery — the sixth section no longer lands on the first

**Before (master 846f3aa010):** the Credits orrery spaced its bodies a fixed 72° apart, which fit the five sections it was drawn for. Third-party notices made six, so body 06 landed at 270° + 360°, exactly on body 01 under the Hand. At every desktop size the current body read "06" while MADE BY was open, the two discs and numbers printed over each other (bench at 1920×1080: four "01 on top of 06" findings), and the ring showed a gap where a sixth section should sit.

**After (`src/ui/orrery/settingsLayouts.js`, one line):** the step is `360 / max(5, sections.length)`, so five sections keep their 72° and six share the whole orbit at 60°. MADE BY now reads 01 under the Hand and the turn to THIRD-PARTY NOTICES brings 06 there. No selector, ID or CSS changes.

**Checked:** ui-bench `credits --walk` at 390×844, 960×540, 1280×720, 1920×1080: 0 findings (1920×1080 was 4); every section click opened. Type floor OK. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish139/` (`compare-*-credits.png`).

**Leftover:** at 1920×1080 the SPACEFACE wordmark's last letter sits right against the ring's outer rim, and the body at 3 o'clock is cut by the window edge (both on master).
