# ui-polish-110 — Missions terms ledger: labels no longer run under their values

**Before (master 30bf3d57f4):** each terms row was its own grid with a fixed label column (118px, or 96–104px in the narrow bands). AUTHORIZATION is one 12px tracked word (~140px), so at 390×844, 960×540 and 1280×720 it ran under "APPROVED: VALE, D." ("AUTHORIZATI" printed over the value). MASS ON ACCEPT and CONTRACT CODE broke onto two lines at 1280×720 with room to spare.

**After (`archiveLayouts.js`, one block at the end of the Missions sheet):** the terms list owns a single label column and each row is a subgrid of it. The column is as wide as the longest label, capped at 10.5em (13em above 1100 wide), and never narrower than its longest word (at 1100 wide or narrower it is just that word). Labels and values stay on one alignment, nothing overlaps, and at 1280×720 and 1920×1080 every label sits on one line. Selectors, IDs and markup are unchanged.

**Checked:** bench `mission-log` at 390×844, 720×700, 960×540, 1024×768, 1280×720, 1920×1080. No new findings; 1024×768 reports the same four route-end "cut off" findings as master (FROM/TO ends ellipsized in the narrow stage). Type floor OK. `mission-log-truthful-47a` 7/7. Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish110/`.

**Leftovers:** at 960×540 the route band (FROM/TO) still starts at the fold; at 1024×768 the card is ~290px so values wrap to four lines and the route ends ellipsize; at 720×700 NO CLOCK sits on the TRACKED row and ABANDON drops to its own line.
