# FB-067 — Demolition, tow recovery and rescue under fire gain a second row each and a career step

**Kind:** deepening · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: missions.js, seam: careerContracts.js
**Write-set:** `src/data/missions.js`, `src/data/careerContracts.js`, `test/fb-archetype-variants.test.mjs`
**Neighbours (extend, never restate):** SFQ-B073, SFQ-B080

## The gap
`demolition`, `tow_recovery`, `rescue_under_fire` and `breakaway_recovery` each have one row and one
completion event; the career ladder reuses nine of seventeen types and never uses demolition, tow, rescue or
salvage. Four archetypes exist only as random board rolls.

## Why this direction
New types were rejected; depth per type is the ask. A second row that changes the physical problem (a tow
through a field vs. a tow under pursuit) and a career step that uses it are data.

## Mechanism
- Author a second row for each of the three with a different physical twist and a different clause set.
- Add a tow step to the hauler ladder and a salvage step to the prospector ladder in `careerContracts.js` using
  the existing stage shape.
- Pin that both rows of each type generate on seed 4242 boards and that the new career steps validate through
  the ladder schema.

## Done when
`test/fb-archetype-variants.test.mjs`: two rows per type generated, career steps valid;
`career-ladders-contract.test.mjs` stays green.

## Do not
Do not add a fifth row. Do not change pay curves. Do not add a mission type.

## Focus test starting points
- `test/career-ladders-contract.test.mjs`
- `test/b7-set-pieces.test.mjs`
