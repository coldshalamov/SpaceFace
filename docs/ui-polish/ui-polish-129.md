# ui-polish-129: phone station dials and Market quantity dial

Scope: `src/ui/orrery/mobileScreenLayouts.js` only (phone sheet, `data-sf-mobile="1"`). Desktop is untouched.

## Review (phone, 390×844 and 360×780)
- Station crown: at 60×40 the dial readings' second line ("/ 100", "/ 40 u") ran into both ends of the arc on every station tab.
- Market quantity dial: the QUANTITY label sat in the narrow top of the ring and ran into the arc on both sides (also at 844×390).

## Fix
- Upright phones (≥561 tall): dials fill their ~66px column (66×54) and the reading drops a line so both lines sit inside the arc. The crown drops its 10px bottom margin so the Market's −/MAX/+ and QUOTE BREAKDOWN stay above the foot at 360×780.
- Quantity dial: the number moves up and QUANTITY sits under it, where the ring is widest, with tighter tracking.

## Checks
- `ui-bench --phone`, 7 station tabs × 390×844, 360×780, 844×390: findings identical to master (no new ones).
- Desktop Market 960×540, 1280×720, 1920×1080: 0 findings, pixel-identical to master apart from the animated scrubber.
- `check:type-floor` OK.
