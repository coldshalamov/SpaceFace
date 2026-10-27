# UI polish 152: Missions rows read on an upright phone

Phone portrait (under 481 wide, 801+ tall), Station Missions tab.

- Before: the board was a second scroller 42px tall inside the list half, so its edge fade masked the only posting in view, and YOURS sat over it. The dossier plate was also its own scroller, so the half showed ACCEPT and HOLD with the job's title faded out underneath.
- After: each half scrolls once. The board and the dossier plate stop scrolling on their own, so the list shows the first two postings whole, and the dossier opens on the job's kind and title, then ACCEPT and HOLD, with the terms scrolling below.
- Scope: the existing `@media (max-width:480px) and (min-height:801px)` contracts block in `src/ui/orrery/stationTabsLayouts.js`. No selectors or IDs changed.
- Checked: station-contracts at 390x844 and 414x896 (bench clean, no findings); 960x540, 1280x720 and 1920x1080 are outside the block and bench clean. Type floor OK.

## Current integration review — 2026-10-27
The two current PR paths were reviewed and merged by content against published master ed2d19b27007ec3e05105595d78fd5009feb6b53, preserving later station-tab work. The new rules remain confined to max-width 480px/min-height 801px and the existing non-mobile desktop-berth selector. The separate data-sf-mobile=1 station presentation remains unchanged. The board/dossier selectors match the live Contracts screen; no input, mission, acceptance or hold authority changes.

The earlier bench statements above describe the original author's qualification, not a new current-source browser run. This integration used no browser or performance capture. Current layout/scroll/key reachability at 390×844 and 414×896 remains a rendered verification task; Node/style checks do not establish those pixel results.

## Rendered walk - 2026-10-27 (integration)
`node scripts/ui-bench.mjs --shot=station-contracts --viewports=390x844,414x896 --walk` on this source:
- 390x844 and 414x896: the board shows both postings whole ("Transport a passenger to Customs Gate 1,963" and "Escort a convoy to Belt Outpost 2,561") with no edge fade masking the first row, and the dossier opens on PASSENGER TRANSPORT plus the job title, then ACCEPT / HOLD, with the terms scrolling below in the same half.
- 960x540 and 1280x720 (outside the block): the two-half desktop berth is unchanged; the bench measured no tangled, buried, cut-off or offscreen type, no empty boxes, and primary controls reachable.
- The walk's phone-size control findings are the open COMMS history overlay covering the tab rail while it is open. That is the overlay working, not a layout regression, and this block does not touch it.
- `node scripts/check-type-floor.mjs` inspected 2229 live declarations (OK) and `node scripts/check-ui-screen-imports.mjs` is 56 ok / 0 fail.