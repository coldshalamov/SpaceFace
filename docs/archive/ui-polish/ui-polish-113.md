# ui-polish-113 — phone Market gets its screen back

- Problem: on a phone (390×844) the destination rail printed every tab's help line under its name (four to eight lines each, ~280px), and the bay screen and station wire stood as two full-width cards (~170px). The Market body was left one heading tall; BUY, SELL and the quantity keys sat under the rail (bench: 7 unreachable at 390×844, 19 at 360×780 + 844×390).
- Fix (mobileScreenLayouts.js, data-sf-mobile only): the rail's help lines are hidden on glass (no hover there; each tab name's aria-label still reads its line). The two signs share one swipeable two-line strip under the next step, styled like the tape, with the label in caps and brighter wire text.
- Result: commodity, quantity dial, total, BUY 1 / SELL and Quote breakdown are on screen at 390×844 and 360×780; bench findings 7 → 0 and 19 → 0. Desktop windows (960×540, 1280×720, 1920×1080) don't set data-sf-mobile and are untouched.
- Still open: MISSIONS badge stacks above its word in the 4-column phone rail; 960×540 desktop Market BUY under the rail (waits on #546).
