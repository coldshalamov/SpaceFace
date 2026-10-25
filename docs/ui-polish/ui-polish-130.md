# ui-polish-130 — Missions key stays clickable at 1101+ × 721–800

**File:** `src/ui/orrery/stationTabsLayouts.js` (one media query widened, two wrap rules added). No selectors, IDs or markup changed.

## Problem (on master)
At 1366×768 (and 1440×800) the Missions dossier keeps its commit key in flow under the terms. A job with a PAYLOAD row and a blocked READINESS reason (Haul 20u Regocrete, Recover 10u Salvage Electronics) pushes the key down under the station tab bar's fade: RESOLVE READINESS is half-buried on Haul and fully off the dossier on Recover, so a mouse misses it.

## Fix
The wide-short placement from ui-polish-128 (key at the top of the route column, beside the title; route ring beneath) now covers 1101+ wide up to 800 tall instead of 720. In that placement the key's reason line ("Need 30u cargo capacity…") wraps under the key instead of running off the right edge (it clipped at 1280×720 on master).

## Checked
- 1366×768, 1440×800, 1280×720: walk findings unchanged (13 each, all the existing command-palette / toast items); key fully visible and hit-testable for Transport, Eliminate, Haul and Recover.
- 1920×1080, 960×540, 390×844 and 844×390 are outside the query and unchanged.
- `node scripts/check-type-floor.mjs` OK.

## Note
In this placement the route uses no tether, so the "1 JUMP · TO …" caption isn't shown — the same as master already does at 1280×720.
