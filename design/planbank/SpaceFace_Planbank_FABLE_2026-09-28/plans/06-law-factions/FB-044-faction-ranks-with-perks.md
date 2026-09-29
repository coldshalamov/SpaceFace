# FB-044 — Standing has named ranks with a perk behind each, on top of the existing number

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: factions.js, seam: serviceQuotes.js, seam: missions.js
**Write-set:** `src/systems/factions.js`, `src/ui/station/serviceQuotes.js`, `src/data/missions.js`, `test/fb-faction-ranks.test.mjs`

## The gap
Reputation doors exist (`MISSION_STANDING_LADDER` gates risk tiers; `factionStanding.js` renders the ladder)
but there are no named ranks (`rank` has zero hits in `factions.js`) and no perks beyond mission access. Every
mature faction system names the step you reached and what it buys.

## Why this direction
A faction screen was rejected (ORRERY, and no empire screen). Named thresholds on the single rep writer, read
by the service quote and the mission board, is additive and screenless.

## Mechanism
- Add a rank table per faction in `factions.js` (four named steps from the existing nine tiers) exposed as
  `+rankForState`; the single writer stays `applyRep`.
- Read the rank in `serviceQuotes.js` for a repair/refuel discount and in the mission board for one rank-gated
  contract row per faction.
- Announce a rank change through the existing `faction:repChanged` consumer path (a bark and a news line),
  pinned once per crossing.

## Done when
`test/fb-faction-ranks.test.mjs`: ranks monotonic in rep, discount applied at the second step, one
announcement per crossing on seed 4242; `depth-program-faction-modules.test.mjs` stays green.

## Do not
Do not add a second rep number. Do not gate the story on rank. Do not add a faction screen.

## Focus test starting points
- `test/depth-program-faction-modules.test.mjs`
- Locate standing suites with `rg factionStanding test/`.
