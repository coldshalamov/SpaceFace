# FB-032 — Seventeen frontier sectors stop inheriting Helios' physics and Helios' arrangement

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectorPhysical.js, seam: sectorCompositions.js
**Write-set:** `src/data/sectorPhysical.js`, `src/data/sectorCompositions.js`, `test/fb-sector-physical-complete.test.mjs`
**Neighbours (extend, never restate):** SFQ-B101

## The gap
`SECTOR_PHYSICAL` has rows for 7 of 24 sectors and `sectorPhysical()` silently falls back to the Helios
baseline; `SECTOR_COMPOSITIONS` covers only the 10 core sectors. A frontier sector feels like the tutorial
harbour by construction. `differingPhysical()` already exists to assert exactly one number differs per row.

## Why this direction
Both are flat lookup tables and the assertion helper exists; one row per sector is the whole fix.
Feel-by-content was rejected: this is the physics ratio and arrangement, not more actors.

## Mechanism
- Author a `SECTOR_PHYSICAL` row per missing sector where exactly one ratio differs from baseline, chosen from
  the sector's hazard (nebula → drag-free but dim sensors; radiation → hotter heat sink; dense asteroid →
  tighter spacing).
- Author a composition recipe per frontier sector using the existing arrangement vocabulary.
- Pin completeness and the one-difference rule in a table test.

## Done when
`test/fb-sector-physical-complete.test.mjs`: 24/24 rows in both tables, `differingPhysical()` true for every
row, and `wave-b6-sector-physical.test.mjs` stays green.

## Do not
Do not change the seven authored rows. Do not add drag. Do not differ two numbers in one row.

## Focus test starting points
- `test/wave-b6-sector-physical.test.mjs`
