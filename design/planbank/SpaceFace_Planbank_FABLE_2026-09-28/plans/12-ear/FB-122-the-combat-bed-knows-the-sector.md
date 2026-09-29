# FB-122 — A fight in the fringe and a fight in the core mix the same four stems differently

**Kind:** deepening · **Lane:** THE EAR · **Routing:** open
**Seam tags:** seam: themeMatrix.js, seam: audioSystem.js
**Write-set:** `src/audio/themeMatrix.js`, `src/audio/audioSystem.js`, `test/fb-combat-bed-sector.test.mjs`
**Neighbours (extend, never restate):** SF-233, SF-234, SFQ-B198

## The gap
Four stems back four theme states, so every combat bed is one bed. `SECTOR_BEDS` and `THEME_STEM_WEIGHTS`
already exist in `themeMatrix.js`, and the theme resolver already receives `sectorId` and `factionId`; the
stem axis stays single. Adjacent to SF-233 (a quiet-sector bed) and SF-234 (music follows the encounter arc):
this is the sector register of the combat state, not the arc.

## Why this direction
New stems were rejected (assets). Weighting the existing stems by sector bed is data on an axis the matrix
already declares.

## Mechanism
- Give `SECTOR_BEDS` entries a stem-weight vector consumed by `resolveThemeMatrix` alongside the state weights;
  core sectors lean on the harmonic stems, fringe on the percussive ones.
- Keep the state hold hysteresis; the sector weights change only on `sector:enter`.
- Pin that combat in Helios and combat in Sker Haven on seed 4242 produce different stem weight vectors and
  identical state sequences.

## Done when
`test/fb-combat-bed-sector.test.mjs`: two sectors, two weight vectors, same state machine;
`pq-158-03-themes.test.mjs` stays green.

## Do not
Do not add stems. Do not change the state thresholds. Do not switch beds mid-fight.

## Focus test starting points
- `test/pq-158-03-themes.test.mjs`
