# ui-polish-140: New Game in a narrow desktop window (≤700 wide)

**Screen:** New Game (`new-game`), desktop sheet (no `data-sf-mobile`) at 390×844 and 600×844.
**File:** `src/ui/orrery/newGameLayouts.js` (CSS only, inside `@media (max-width:700px)` / `(max-width:480px)`, scoped to `NGD`, the desktop-only New Game selector).

## What was wrong (master 7478b66b4a)
- The two-column grid kept its `clamp(340px, 25vw, 470px)` form column, so at 390 wide the stage got 0px and sat off the right edge (x=400, width 0).
- The yard carousel measured that empty stage and piled HITCH, PELICAN and WASP on the frame's top-left corner (the "SPN / VEB" smudge over the title). The player could not see or pick a hull. Bench: 6 tangled ("Hitch" on "Pelican"/"Wasp", "New game" on "Brawler").
- At 600×844 the stage was ~190px wide: the hull's name, line, fittings, ring and yard all printed on each other (bench: 6 tangled).

## What changed
- ≤700 wide desktop: the plate is one column that scrolls as a page (the `#screens` layer scrolls, the plate grows to its content): title → form → stage (hull name and line, stats ring, yard) → LOADOUT → FIRST 15 MINUTES → footnote. BACK / LAUNCH stay pinned at the window's foot over a dark fade while the column scrolls under them.
- Rework after Code Work's handback: nothing is hidden any more. The fittings list shows as one column of name + size under a rule; the first-fifteen-minutes scale shows all four beats two by two, each with its line; the LINE gloss ("massline winch speed") stays, set condensed so it fits beside the ring.
- The hero box keeps 68px left for MASS and 113px right for LINE and its gloss, and centres once the stage is wide enough. The yard's rear names drop just below the ring's floor ellipse (it was drawn through them) and the front name drops a line under them. ≤480 wide, rear names set at 12px and go by name only.
- No markup, selector or ID changes. Phones (`data-sf-mobile="1"`) and every desktop width above 700 are untouched.

## Bench (findings, new-game)
| viewport | master | branch |
|---|---|---|
| 390×844 | 6 | 2 overlaps + 2 buried |
| 600×844 | 6 | 1 overlap |
| 700×844 | — | 1 overlap + tangled |
| 960×540 / 1280×720 / 1920×1080 | — | 0 / 0 / 0 (rules don't apply above 700w) |
| 390×844 `--phone` | 0 | 0 (rules exclude data-sf-mobile) |

The remaining narrow findings are all the yard's names (WASP / PELICAN) sitting under the pinned BACK / LAUNCH bar at scroll 0, which is the intended scroll-under behaviour; scrolled, they clear (see shots). Walk at 390×844 and 600×844: PELICAN and WASP change the hull, and LAUNCH works.

## Compare shots (local only, not committed)
- /workspace/spaceface-scratch/ui-shots/polish140/compare-rw-390x844.png
- /workspace/spaceface-scratch/ui-shots/polish140/compare-rw-600x844.png

## Leftovers noticed
- 960×540 (master too): the difficulty note "Standard — Softer hits…" is cut mid-line at the bottom of the form band.
- 800×900 (master too): the run's beat titles ("Wake at the beacon" / "Tether the derelict") collide. The 701–1100 band at >600 tall has no rule.
