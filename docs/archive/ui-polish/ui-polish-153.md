# ui-polish-153: stunt/LOG callout clears the bottom-sheet decision card

## Found (600×844, Code Work's report)
- Under 901 wide (or 621 tall) the prompt deck is a bottom sheet from 118px up to 44vh, across the same left edge as the stunt/LOG callout column (left 16px, bottom 32vh). A LOG line such as IMPACT LOGGED printed over a Rig Workshop / recovery decision card's headline and choices.

## Changed
- `src/ui/stuntCallout.js`: the column's existing clearance seat (speed dial, STABLE LOAD) also clears a showing `#sf-prompt-deck`, 12px above it, only when they overlap horizontally, so the desktop right-column deck is unaffected. The seat is re-measured when a line is added or refreshed (event rate, never per frame).
- `test/pq-146-03-stunt-callout.test.mjs`: a card that rises under a showing column lifts it on the next line.

## Result
- Unit: stunt callout suite 11/11. Type floor OK.
- Screens (ui-bench flight + a live prompt-deck recovery card + two `physics:impact` lines; not committed): at 390×844, 600×844 and 960×540 the IMPACT LOGGED line now sits 12px above the card instead of being lost under/over its headline. 1280×720 and 1920×1080 (right-column deck) are unchanged.

## Next
- The LOG line reads dim against bright scenery (orange station glow) at phone sizes; a contrast pass on `.sf-stuntcall__name` is a separate follow-up.
