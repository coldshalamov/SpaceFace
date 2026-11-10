# M-06 catalog — racing

Surface: `src/data/raceCourses.js` (generated lane/ring courses + authored circuit specs),
`src/data/raceLevels.js` (RACE_LEVELS ×3 — Textile Belt / Tally Circuit / Veil Wash —
plus CONTRACTS ×5 and generated PRACTICE rows), `src/ai/racingDriver.js`
(RACING_PERSONALITIES: Mira Vale / Rook Six / Sable Reed — name, hull, style, pace,
corner, lane), `src/missions/racingOpponents.js` (dirty), `src/systems/racingCareer.js`
(modes, rivals, medals, cups, standings), `src/data/racingSetPieces.js` (dirty).

## Writable seams

- `CONTRACTS` in raceLevels.js is an append-shaped authored list — each row carries
  title/brief/summary/gridLine in a sport register; `racingKind` reuses shipped kinds.
- RACING_PERSONALITIES fields are single strings — closed for appends.
- Opponent persistence + set-piece files are foreign dirty — preserved.

## Limits

No crowd-line corpus exists in data today (checked racing files, roamingStories,
stationLife — no racing-read array). Rival personalities and course landmarks are
editable fields, not additive seams. The honest slice is one more authored contract —
the surface's own unit of "course + grudge".

Review: catalog ✓3 (Drifter / Archivist / Skeptic) — recorded.
