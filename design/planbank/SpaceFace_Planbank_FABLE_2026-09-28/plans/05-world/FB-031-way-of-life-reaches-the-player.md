# FB-031 — The authored way-of-life sheet is read on arrival and feeds the zones it describes

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: sectorWayOfLife.js, seam: sectorPostcard.js, seam: sectorZones.js
**Write-set:** `src/data/sectorWayOfLife.js`, `src/ui/sectorPostcard.js`, `src/data/sectorZones.js`, `test/fb-way-of-life-consumed.test.mjs`
**Neighbours (extend, never restate):** SFQ-B101, SFQ-B107

## The gap
`src/data/sectorWayOfLife.js` authors nine columns per sector (verb, rhythm, law, crime, ships, structures,
hazard geometry, landmark, signature toy) for six sectors and has zero importers in `src/`. It is the design
document for what a sector is, and the game never reads it.

## Why this direction
Rewriting the sheet as code was rejected; two consumers already exist in shape: the arrival postcard (a
per-sector surface fed by market news) and the zone table.

## Mechanism
- Import `SECTOR_WAY_OF_LIFE` into `sectorPostcard.js` and show the sentence and signature toy on sector entry
  (functional edit, ORRERY-consistent).
- Derive a default `hazardGeometry` zone for the eighteen sectors without a row in `sectorZones.js` from the
  sheet where present, else from the sector's hazards list.
- Extend the sheet to all 24 sectors (one row each) so the table test can assert completeness.

## Done when
`test/fb-way-of-life-consumed.test.mjs`: 24 rows, every `signatureToy` maps to an id in `ALL_KILL_MACHINES` or
is explicitly none, and the postcard model for a seed-4242 arrival carries the sentence.

## Do not
Do not turn the sheet into a lore dump on the HUD. Do not add zones that are not in the sheet.

## Focus test starting points
- Locate postcard suites with `rg sectorPostcard test/`; `test/wave-b6-sector-physical.test.mjs` for the
  zone/physical seam.
