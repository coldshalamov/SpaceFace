# ui-polish-137 — Shipworks identity line clears the hull drawing at 1024×640

**File:** `src/ui/orrery/shipworksLayouts.js` (one new media block, 1001–1100 × 461–640, hover, CSS only). No selectors, IDs or markup changed.

## Problem (on master)
At 1024×640 the hull identity (`STARTER · 1/7 systems fitted · 0 t modules`) wrapped inside its 220px box beside DOCKED, and its second line printed on the hull drawing's top-right numeral (`05`, Mining). ui-bench flagged 4 tangles. (Leftover from ui-polish-136.)

## Fix
In that band the identity box drops its 220px cap and stays on one line beside DOCKED, which ends above the callout columns. Not at 960×540 (≤1000 wide), where the hardpoint cards rise to the nameplate's line and the identity has to keep wrapping clear of them (tried there first: 0 → 6 findings, so it's excluded).

## Checked
- ui-bench `station-shipworks`: 1024×640 4 → 0; 1001×640, 1100×640, 960×540, 1280×720, 1920×1080 all 0. 390×844 unchanged (15 tab-strip reachability findings, same as master).
- Pixel Δ (>8) vs master: 0.00% at 960×540, 1280×720, 1920×1080, 390×844.
- `node scripts/check-type-floor.mjs` OK.
- Shots (not committed): `/workspace/spaceface-scratch/ui-shots/polish137/compare-1024x640-shipworks.png`.

## Leftovers
- 1024×640: two of the hull's pip markers hang below the ring toward the verb row.
