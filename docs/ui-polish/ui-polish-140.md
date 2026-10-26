# ui-polish-140: New Game in a narrow desktop window (≤700 wide)

**Screen:** New Game (`new-game`), desktop sheet (no `data-sf-mobile`) at 390×844 and 600×844.
**File:** `src/ui/orrery/newGameLayouts.js` (CSS only, inside `@media (max-width:700px)` / `(max-width:480px)`, scoped to `NGD`, the desktop-only New Game selector).

## What was wrong (master 7478b66b4a)
- The two-column grid kept its `clamp(340px, 25vw, 470px)` form column, so at 390 wide the stage got 0px and sat off the right edge (x=400, width 0).
- The yard carousel measured that empty stage and piled HITCH, PELICAN and WASP on the frame's top-left corner (the "SPN / VEB" smudge over the title). The player could not see or pick a hull. Bench: 6 tangled ("Hitch" on "Pelican"/"Wasp", "New game" on "Brawler").
- At 600×844 the stage was ~190px wide: the hull's name, line, fittings, ring and yard all printed on each other (bench: 6 tangled).

## What changed
- ≤700 wide desktop: the plate stacks as title → form (it scrolls in its own band, and its last line fades out instead of being cut in half) → stage (`minmax(290px, 42vh)`) → BACK / LAUNCH → footnote.
- On the stage, the hull keeps its name, line, stats ring and yard. The run's four-beat scale and the fittings line are hidden visually but stay in the accessibility tree, the same treatment as the existing ≤460-tall band. The hero box narrows and drops so THRUST clears the line and MASS / LINE stay inside the frame. The ring's numbers go to 24px, and the LINE gloss is hidden because it ran past the right edge.
- ≤480 wide: the yard's rear names set at 13px with tighter tracking so WASP and PELICAN don't touch.
- Phones (`data-sf-mobile="1"`) and every desktop width above 700 are untouched.

## Bench (findings, new-game)
| viewport | master | branch |
|---|---|---|
| 390×844 | 6 | 0 |
| 600×844 | 6 | 0 |
| 960×540 / 1280×720 / 1920×1080 | — | 0 / 0 / 0 (rules don't apply above 700w) |
| 390×844 `--phone` | 0 | unchanged (rules exclude data-sf-mobile) |

Walk at 390×844: PELICAN and WASP clicks change the hull, and LAUNCH works.

## Compare shots (local only, not committed)
- /workspace/spaceface-scratch/ui-shots/polish140/compare-390x844-new-game.png
- /workspace/spaceface-scratch/ui-shots/polish140/compare-600x844-new-game.png
- /workspace/spaceface-scratch/ui-shots/polish140/compare-390x844-new-game-pelican.png

## Leftovers noticed
- 960×540 (master too): the difficulty note "Standard — Softer hits…" is cut mid-line at the bottom of the form band.
- 800×900 (master too): the run's beat titles ("Wake at the beacon" / "Tether the derelict") collide. The 701–1100 band at >600 tall has no rule.
- 390×844: in the narrow stack, seed and first-flight sit below the fold of the form band and need a scroll.
