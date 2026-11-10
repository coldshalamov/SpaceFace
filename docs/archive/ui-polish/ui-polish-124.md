# ui-polish-124 — Ledger purse beside the tape on short glass; destination rail clears COMMS at 1101–1200

**Screens:** Station Ledger tab (1101–1440 wide × 461–720 tall) and the station destination rail (1101–1200 wide, every tab). Files: `src/ui/orrery/stationTabsLayouts.js`, `src/ui/orrery/stationLayouts.js` (CSS only, two new media blocks, no selector/ID changes).

**Problems:**
- The Ledger's purse gauge (NET · CR with BOUGHT / SOLD) sat under the tape. At 1101×700 its BOUGHT / SOLD keys ran under the destination rail; at 1280×540 the whole gauge fell below the panel and was gone.
- At 1101–1200 wide the rail's 64vw cap is narrower than the seven words at .16em tracking with 16px gaps, so LEDGER ran straight into COMMS.

**Fix:**
- Ledger, `@media (min-width:1101px) and (max-width:1440px) and (min-height:461px) and (max-height:720px)`: the right column becomes a grid, tape `1fr` beside a 230px purse on one row; the reading (when an entry is picked) takes the full width under them. Same pattern the 651–1100 × ≤640 block already uses.
- Rail, `@media (min-width:1101px) and (max-width:1200px)`: nav gap 16 → 14px and label tracking .16em → .12em, so LEDGER ends with clear air before COMMS.

**Result (ui-bench findings, master → branch, `_assets-7c9ab`):** station-ledger 1101×700 4 → 0, 1280×540 6 → 0, 1280×720 0 → 0. Market, Shipworks, Industry and Missions unchanged at 1101×700, 1280×540 and 1280×720. 390×844, 960×540 and 1920×1080 are outside both queries.

**Leftovers:** Market BUY / SELL sit under UNDOCK at 1152×648 and just below the fold at 1280×540 (pre-existing); Shipworks 1280×540 tab-body clips (14); Missions "Tracked" clip at 1101×700 and 1280×540.

**Shots (not committed):** `ui-shots/polish124/compare-*.png`; full sets in `ui-shots/polish124/{before,after}/`.
