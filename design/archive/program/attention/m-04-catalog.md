# M-04 catalog — mission board offers

Surface: `src/data/missions.js` (type params + `missions.js` sole runtime owner of offer
rolls) + `src/systems/missionBoardOps.js` (`_briefFor` generated briefs, deterministic
identity, foreign hunk adds `options.state` passthrough) + `src/data/bountyMarks.js`
(`MARK_NAMES` roster, `MARK_HAIL_LINES`, faction pools, `rollBountyMark` seeded pick) +
`src/data/economyContractTemplates.js`.

## What already exists

- Offer types: cargo, bulk trade, bounty, mining, salvage, escort, patrol, smuggling,
  passenger, recon, tow, demolition, rescue, race, authored set piece, capital boss.
- `brief`/`summary` one-line fields, `storyTarget` named marks, faction/dest/risk/params.
- `bountyMarks.js`: 30 named marks, 27 hail lines; picks are `hash32 % array.length`
  — appends keep determinism but re-deal which entry a given seed draws.

## Writable seams

- `MARK_NAMES` / `MARK_HAIL_LINES` — append-shaped corpora; the mark test asserts
  determinism (A vs B), not literal entries.
- `_briefFor` composition is code, not data — not a seam for this pass.

## Foreign

`missionBoardOps.js` dirty (state passthrough) — untouched. `missions.js`,
`bountyMarks.js` clean.

Review: catalog ✓3 (Drifter / Archivist / Accountant) — recorded.
