<!-- LIFETIME: RECEIPT -->
# PQ-130.04 Cells speak — receipt

**State:** done (2026-08-21). **Law:** design law §2.3, §2.7, §3.5, §5 (gas/lock rows), §11.1, §11.6.

## What shipped
- **Fog of war removed.** `src/systems/drill.js` `isTileSurveyed` is the single presentation gate and now
  returns true; `pulseScan()` still marks `tile.surveyed` (cosmetic assay ping, the drive checks' session
  record) but it no longer decides what a person may see. No sim value (yield, hardness, tier gate,
  hazard, rock budget, save field) ever read the gate. The PQ-024 claim-survey lifecycle is untouched.
- **Three-channel material identity** as lit 3D geometry on the beveled blocks
  (`src/render/asteroidInteriorPreview.js`: `makeMetalVeinGeo`, `makeIceSheenGeo`,
  `makeExoticLatticeGeo`, `makeRadialCrackGeos`, `makeGasCoreGeo`, `makeVentedScarGeo`,
  `makeBasaltBandGeo`, `makeMkStampGeo`): metal ores as faceted PBR crystal clusters with a vein
  (silver / gold / orange families), ice as a pale glassy block, exotics as lattice inclusions on dark
  violet hosts, gas as a dark olive cell with radial cracks and a core, vented pockets as scars, basalt
  with bands. Six rock buckets (`matrix`, `basalt`, `metal`, `ice`, `exotic`, `gas`) with per-bucket
  tints and three lift/bulge variants.
- **Seams as bodies** (`src/ui/asteroid/asteroidRenderer3d.js`): 4-connected same-ore components
  (`SEAM_MIN_BODY = 2`) get a perimeter outline in the ore's colour and a count chip at the anchor —
  chips are supersampled textured mesh pills (13px numerals, 20px pill) so they live in the scene, not
  the DOM. **Split preview:** aiming at a seam cell redraws the outline as the resulting bodies with their
  counts. **MK lock plate:** one engraved stamp on the aimed locked cell, fading in while aimed.
- `asteroidRenderer2d.js`: token values aligned to the board (export names/shapes kept).
- **Headless hook + checks:** `canvas.__ast3d = { cellAppearance, projectCell, … }`;
  `scripts/check-asteroid-theater.mjs` now asserts law §11.1 (102 cells projected, worst edge 0.000px,
  worst squareness 0.00%, 120px cells at 1080p / 80px at 720p) and §11.6 (1251 solid cells beyond the
  old reveal radius, all drawn with a material; per-material census). `scripts/capture-asteroid-works.mjs`
  adds `06-cells-speak.png` and `07-deep-materials.png`.

## Evidence
- `npm run check:asteroid-theater`: holds at 1920×1080 and 1280×720 with the new assertions.
- Stills reviewed by the orchestrator: `06-cells-speak.png` (crystals, cracked gas, basalt bands,
  `Ag 2` / `Si 2` chips, MK2 plate beside the rover, split preview), `07-deep-materials.png` (gold `Au 2`,
  exotic lattices, ice, gas, basalt).
- `check:playable` 14/14 on two of three runs; the one CLEAN trip is the known intermittent ship-texture
  blob race (a module-load fault would fail every run). `asteroid-drive-cadence` PASS,
  `check-drill-smooth` PASS, `pq024-survey-claim` 22/22.
- `check:baseline` 8/12 — the four 47a sim links remain red from another lane's uncommitted AI/physics
  files (reproduced identically with this leaf's files reverted by the previous two leaves).

## Known, recorded
- The strata generator rolls materials per cell independently, so the biggest seam body on a fresh rock
  is 3 cells — real veins are the future formations leaf (design law §12 future packets), not this one.
- Gas crack colour is at the saturated end; revisit with the events leaf if it competes with ore.
- The implementer was terminated by an API limit mid-verification; the orchestrator completed
  verification and wrote this receipt from the diff and the checks.
