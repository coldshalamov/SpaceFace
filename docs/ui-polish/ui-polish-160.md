# ui-polish-160: phone hull reading finishes its sentence under 390 wide

**Screen:** station (any tab), phone portrait 360–389 wide (360x780, 375x667, 384 Android).

**Problem:** the swipeable tape's first card ("HULL MECHANIC" + the mechanic's hull line) is clamped to two lines. At 360x780 the wide-tracked title (.14em) pushed the last word off, so the card read "…The yard can close…". The bench flagged it as cut off by its own panel.

**Fix (`src/ui/orrery/mobileScreenLayouts.js`, inside the existing `(min-height:561px) and (max-width:389px)` phone block):** the tape's badge/title track at .06em and the inline gap after them is 4px instead of 6px. The line now ends "…The yard can close that." inside the same two lines at 360x780 and 375x667. Still 12px type; 390+ and desktop are outside the query and unchanged.

**Checked:** 360x780, 375x667, 390x844 (phone bench, DPR 2). 960x540 / 1280x720 / 1920x1080 aren't touched: the rule lives in the phone-only (`data-sf-mobile`) block under 390 wide. `check:type-floor` passes.

**Leftovers seen:** at 375x667 the Market trade (quantity dial, BUY) sits under the destination foot until you scroll; the MISSIONS badge at 360 sits on the foot's right edge.
