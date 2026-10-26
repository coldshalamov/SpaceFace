# ui-polish-144 — New Game: the 701–800px stage fits its fittings, hero and ring

**Before:** on desktop windows 701–800px wide and 860+ tall (701×860, 720×900, 760×900, 800×900), the stage is ~250–340px wide.
The loadout's two columns ran off the right edge (SHIELD BOOSTER, MINING LASER cut), the hero render and the
ring's THRUST reading sat on top of the loadout, and the ring's right reading (5.5k LINE and its gloss) ran off the frame.

**Change:** `src/ui/orrery/newGameLayouts.js`, one `(min-width:701px) and (max-width:800px) and (min-height:860px)`
block (desktop only). The fittings wrap as one flowing list (same treatment as the 960×540 band), the hero box narrows
to 52% and drops below the loadout, the ring's side labels set at normal width with the LINE gloss condensed (as in
the one-column layout), and the rear yard names set at 12px so WASP and PELICAN don't touch. No markup, selector or
data changes. Outside the query (390×844 phone, 700×900, 701×800, 760×859, 801×900, 960×540, 1280×720, 1920×1080) the
screen is pixel-identical to master.

**Review fixes (Code Work, changes needed at 0704ecc22b), all inside the same block:**
- The narrower ring put the rear hulls' subtitles (BRAWLER, SKATER, TUG) on the front hull's name (glyph contact at
  760×900, ~1px at 800×900, overlapping by up to 13px at 701×860). The rear subtitles were 5–13px too low to clear the
  front name, and moving the rear names up puts them on the yard ring and the hull models, so the rear hulls go by name
  only, as at ≤480 (`opacity:0` on the rear `.k-word-sub`). Front name and class stay. Every hull in front
  (Hitch, Pelican, Wasp) is clear at 701×860, 720×900, 760×900 and 800×900 (smallest text gap 4.3px, at 701×860).
- The hull render floated above the ring over THRUST's "100" at 701×860 and 720×900 (not only under 860 tall, as this
  doc said before). Cause: the run's hidden hover beats (opacity 0 but still laid out) made the run ~230–340px tall, so
  the yard, which stays above the run's top, was pulled ~120px up off the hero box and the render with it. The run
  keeps its titles only here (as in the ≤800-tall band), so the yard and the render sit in the ring at every size.
  Trade-off: hovering a beat no longer shows its line at these sizes.
- The hero box keeps 44px left of it for MASS and 90px right for LINE and its gloss
  (`--ng-hero-w:min(52%, 100% - 134px)`, `--ng-hero-x:max(44px, min(21%, 100% - w - 90px))`): at 701–760 it narrows
  and slides left, so "5.5k" and "massline winch speed" end inside the window (gloss right edge 697/715/753 at
  701/720/760, was 719/732/761). 800×900 is unchanged (the formula gives the old 21%/52%).

**Checked:** 701×860, 720×900, 760×900, 800×900 with each hull in front: no text collisions, loadout, ring readings and
render inside the window and the ring. Type floor OK.

**Leftover:** at 701–800px and under 860 tall (720×800) the hull render still doesn't follow the hero box (outside
this block). At 701×860 the rear names (PELICAN, HITCH) sit on the yard's floor ring either side of the amber bead, as
they did before. ≤480 BACK/LAUNCH band show-through is still open.
