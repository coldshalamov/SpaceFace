# ui-polish-111 — Game Over on a phone, the stacked scroll, and black-box labels

Files: `src/ui/orrery/gameOverLayouts.js`, `src/ui/orrery/saveSortieTape.js`. Selectors/IDs unchanged.

**Before**
- 390×844: the headline ran off the right edge (DESTROYE…), the Continue lamp key was cut off (…RECOVERY BERT), and the career ring (750px of rim stations) spilled both sides, so THIS HULL LASTED, BEST SINGLE TRADE, KILLS and LIFETIME PROFIT were cut. The black box got ~150px of channel beside its legend, and LAUNCH printed over LOST.
- ≤1100 wide (stacked layout): the rays layer made the screen scroll sideways (scrollWidth 1257 at 390, 1543 at 960) and ~500px past the tape into bare backdrop; the scrim scrolled away with the first screenful, so the ring and tape sat on the bright backdrop.
- Every size: black-box words were spaced by a 7.4px-per-letter guess, so at 960 DOCKED · HELIOS STATION ran into JUMPED · IO REACH, and at 1280 SOLD CARGO touched KILL · PIRATE.

**After**
- Phone (≤640): headline `clamp(28px, 9vw, 42px)` (CAUSE UNRECORDED fits too); the lamp key spans the column and wraps; the ring is a 182px dial with time flown at the hub, and its six figures sit in a two-up list under it. The tape lifts its legend onto one line over the channel (any tape under 560px wide) and takes the full width.
- Stacked (≤1100): rays and scrim are `position:fixed`, `overflow-x:hidden`; the scroll ends at the tape (sh 1515 → 1008 at 960).
- Tape words are measured with `getComputedTextLength` (estimate kept for headless tests), redrawn when fonts finish loading, slid inside the tape at the ends, and minute labels skip any that would touch LAUNCH, the previous minute or LOST.
- 1280/1920 composition unchanged; only the black-box words move to rows where they don't touch.

**Still open:** at 1280/1920 the 8m 23s stop's 22px hit box overlaps the loss stop's (bench OVERLAP, same on master).

Shots: `ui-shots/polish111/compare-game-over-{390x844,960x540,1280x720}.png`.
