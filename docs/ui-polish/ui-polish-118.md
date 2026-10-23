# ui-polish-118: 1280×540 Codex: section scale clears CLOSE

## Problem
At 1101–1400 wide × ≤640 tall (e.g. 1280×540) the Codex used its full-size unlock dials, so the
title row stood too tall. The section scale (STORY … LEDGER) ran down under the foot, where
CATALOG / LEDGER sat under `‹ CLOSE ESC`, and the plate rode up into the dials. ui-bench reported
4 tangles: "Archive" is printed on top of "Close" (and the reverse).

## Fix (`src/ui/orrery/archiveLayouts.js`, desktop-only blocks)
- The existing short-window block (rungs and foot close up) now covers widths up to 1400px
  (`max-width:1100px` → `1400px`, still `max-height:640px`).
- New `@media (min-width:1101px) and (max-width:1400px) and (max-height:640px)` block that uses
  the 960 sizes: 46px dials in 72px items, 12px dial words, 20px tabs, plate
  `min(300px, 48vh, 29vw)` set 34px below centre.

Windows taller than 640px, narrower than 1101px and phones don't change.

## Viewports checked (ui-bench `--shot=codex`)
| viewport | findings before → after |
|---|---|
| 1280×540 (`--walk`) | 4 tangled (Archive/Close) → 0; no overlaps, clipping, offscreen or reachability findings |
| 1280×720 | 0 → 0; layout identical to master (127 px differ, all scrambled-glyph animation) |

The shot set was reduced because free disk was under the 26 GB floor.
960×540 and 1920×1080 were not re-shot; the new block starts at 1101px wide and stops at 640px tall.
Shots: `spaceface-scratch/ui-shots/polish118/compare-codex-1280x540.png`, `compare-codex-1280x720.png`.

## Leftovers
- Master is missing `src/ui/station/stationLife.js` (station screens don't mount). Not this branch.
- Game Over tape: guard for i/i+2 squeezed stops at 390×844 (0.2px clearance) from #550 review.
