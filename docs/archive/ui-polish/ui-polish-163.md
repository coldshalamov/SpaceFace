# ui-polish-163 — every station tab draws on short small windows (651–800 × ≤460)

**Problem.** At 760×420 and 700×460 the station head (name, mechanic's note, next step, purse and five dials) took the whole height between the top edge and the destination rail. Market, Shipworks and Missions already capped the head, but Industry, Factions, the Bar and the Ledger drew nothing at all: the player picked a tab and saw an empty band.

**Fix** (`src/ui/orrery/stationLayouts.js`, the 651–800 × ≤460 block only): the existing 100px scrolling head cap now applies to every tab, and the capped head fades out over its last 16px so the dials' verbs read as scrolling on instead of sliced by the tab's top edge. Shipworks keeps its 200px stage floor. No selectors, IDs or markup changed; other sizes are untouched (390×844, 960×540, 1280×720 and 1920×1080 fall outside the query).

**Seen, not fixed here:** at 700×460 Industry's "Find a refinery on the chart" note overlaps the dial's PER RUN; at 760×420 Missions' "HOLD TO ACCEPT" is cut at the right edge; Shipworks' bench preview logs `attachNestBayIndicators is not defined` (render code, not this lane).
