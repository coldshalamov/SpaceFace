# ui-polish-144 — New Game: the 701–800px stage fits its fittings, hero and ring

**Before:** on desktop windows 701–800px wide and 860+ tall (760×900, 800×900), the stage is ~340–380px wide.
The loadout's two columns ran off the right edge (SHIELD BOOSTER, MINING LASER cut), the hero render and the
ring's THRUST reading sat on top of the loadout, and the ring's right reading (5.5k LINE and its gloss) ran off the frame.

**Change:** `src/ui/orrery/newGameLayouts.js`, one `(min-width:701px) and (max-width:800px) and (min-height:860px)`
block (desktop only). The fittings wrap as one flowing list (same treatment as the 960×540 band), the hero box narrows
to 52% and drops below the loadout, the ring's side labels set at normal width with the LINE gloss condensed (as in
the one-column layout), and the rear yard names set at 12px so WASP and PELICAN don't touch. No markup, selector or
data changes. 390×844, 960×540, 1280×720 and 1920×1080 are pixel-identical to master.

**Checked:** 760×900, 800×900 (nothing clipped or overlapping). Type floor OK.

**Leftover:** at 701–800px and under 860 tall (720×800) the hull render doesn't follow the hero box and floats above
the ring; needs a look at how the stage still is placed. ≤480 rear-hull subtitles and the BACK/LAUNCH band show-through are still open.
