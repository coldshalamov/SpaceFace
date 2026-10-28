# ui-polish-164: Game Over headline fits short windows and phones

- **960x540 (641-1100 wide, <=640 tall):** the 66px loss-cause headline ran to three lines and pushed the recovery verbs and career record down the frame. It now takes the same 40px size the short-desktop band (1101w+) already uses, so the cause sits on two lines and the verbs and the top of the career ring are in view.
- **Phones (<=640 wide):** at 390 the cause split mid-word ("(CRIMSON REA / CH)") because the faction name holds together as one unit wider than the column. The headline is now `clamp(22px, 6.6vw, 34px)` with `text-wrap:pretty`, so "(CRIMSON REACH)" fits on one line at 375 and 390.
- 1280x720 and 1920x1080 are untouched (the rules are scoped to the bands above).
- File: `src/ui/orrery/gameOverLayouts.js` only. No selectors or IDs changed.

Leftovers seen this session: Records Wall (statistics) empty state leaves a large blank stage and the category row wraps LAW onto a second line at 390.
