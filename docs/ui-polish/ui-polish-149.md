# ui-polish-149: Crucible refit at narrow, tall desktop windows (480–699 wide, 600+ tall)

Desktop only (`html:root:not([data-sf-mobile="1"])`); the phone layout is untouched.

## Found (600×844, 640×1000)
- The compact hull jig gives each hardpoint label a ~150px column. A nowrap head ran "EMPTY THRUSTER M" off the left edge (it read "PTY").
- The STRIP verb sat beside a fitted part's name and squeezed it to one word per line ("Bank / Stream / M").
- A spare's stat ("31 dps · impulse 28") stood as a three-line sliver beside its name.
- The "5 of 8 fitted" engraving was hidden under the two-row TAKE THE WIN / KEEP GOING foot.

## Changed (`cruciblePreparationLayouts.js` only, CSS)
- In that bucket the label head wraps, the STRIP / FIT verb takes its own row under the name, and the name steps down to 15px so "Bank Stream M" and "Shield Booster S" read on one line.
- A spare's stat reads on the line under its name.
- The fit count rides just above the foot.

## Result
- 600×844, 640×1000, 680×720: every label reads in whole words inside the window; the fit count is visible.
- 390×844, 960×540, 1280×720, 1920×1080 are outside the media query and unchanged.
- Type floor passes.
