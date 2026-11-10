# ui-polish-123 — Station head: the five dials on one row at 1101–1280 wide

**Screen:** Station berth head (every tab: Market, Shipworks, Industry, Missions, Ledger…), 1101–1280 wide, 461–800 tall. File: `src/ui/orrery/stationLayouts.js` (CSS only, one new media block, no selector/ID changes).

**Problem:** From 1101 to 1280 wide the crown column was the vitals strip's 326px cap, so with D247's ≤1280 wrap the five dials stacked 2·2·1 into a ~330px tower. CREDIT LINE OPEN ran off the right edge ("CREDIT LINE OPE"), the head grew to ~300–400px, and at 1280×540 LEDGER's DRAW line and the Munitions dial printed over the station wire. At 1280×720 the Market lost its commodity list and BUY under the head.

**Fix:** `@media (min-width:1101px) and (max-width:1280px) and (min-height:461px) and (max-height:800px)`: head columns `minmax(0, 1fr) max-content`, the crown sized to its strip, and the strip on one nowrap row (6px gaps, 684px). The mechanic's note and next step take the rest (~494px at 1280, ~320px at 1101). D247's wrap still applies everywhere outside this window (taller or narrower glass), so the strip never spills left over the note.

**Result (ui-bench findings, master → branch, `_assets-7c9ab`):**

| Screen | 1101×700 | 1280×540 | 1280×720 | 1280×800 |
|---|---|---|---|---|
| station-industry | 0 → 0 | 4 → 0 | 0 → 0 | 0 → 0 |
| station-contracts | 5 → 3 | 9 → 5 | 5 → 0 | 3 → 0 |
| station-ledger | 6 → 4 | 10 → 6 | 6 → 0 | 6 → 0 |
| station-market | 7 → 0 | 13 → 7 | 7 → 0 | 2 → 0 |
| station-shipworks | 6 → 0 | 13 → 13 | 11 → 0 | 4 → 0 |

Total 117 → 38. Head height at 1280×540 324 → 255px, at 1280×720 428 → 255px. 390×844, 960×540 and 1920×1080 are outside the query and unchanged.

**Leftovers:** 1280×540 Market BUY/SELL still sit just below the fold; Shipworks 1280×540 findings are the tab body (unchanged count); LEDGER and COMMS touch on the foot rail at 1101 (pre-existing).

**Shots (not committed):** `ui-shots/polish123/compare-station-{industry-1280x540,market-1280x720,shipworks-1280x720,industry-1101x700}.png`; full sets in `ui-shots/polish123/{master,after}/`.

**Checks:** type floor OK; `d247-charge-quote-visible` 3/3.
