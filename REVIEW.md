
## ui-polish-98 — Save/Load stacked page at 641–790 × 461–749: the way back pins to the frame

- Problem (master 5e5b619b57): at 790 × 461–561 (and 641–790 in the stacked layout) the page runs ~630–730px in a scrolling root, so EXPORT / IMPORT / BACK and 12–15 text lines sat under the fold; elementFromPoint at the frame took no click on the three (bench reported 0).
- Change (`src/ui/orrery/saveLayouts.js` only): in the stacked band under 750 tall, `.k-foot` is `position:sticky; bottom:0` on an opaque shade band, the root gets `scroll-padding-bottom:104px` so focus/scrollIntoView keep controls clear of it, and the title/top padding take the short-desktop size. No selectors or IDs changed.
- Results (probe, no scroll): EXPORT/IMPORT/BACK clickable at every checked size on both screens. Off-frame text 15→11 (790×461), 14→10 (790×500), 12→4 (790×561), filled; 12→2, 6→1, 3→0, empty. With scrollIntoView every control is clickable, 0 unreachable text. 790×750, 791×461, 960×540, 1280×720 and the 390×844 phone have byte-identical layout rect hashes vs master.
- Known trade-off: at ≤461 tall (filled) LOAD / SAVE HERE / DELETE start under the pinned foot until the page scrolls (~40px); at 790×500/700×500 (empty) the strip's labels scroll under it. Both are scroll-state occlusion, not static overlap.
- Shots: `/workspace/spaceface-scratch/ui-shots/polish98/compare/` (master left, PR right).
