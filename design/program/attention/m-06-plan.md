# M-06 plan — racing

Tribunal synthesis (Drifter + Archivist + Skeptic):

**Slice**: one new authored contract row in `CONTRACTS` (src/data/raceLevels.js) —
`contract_textile_rematch`, `level_textile_outbound`, racingKind `laps`, 2 laps,
steerLock 'racing', 1500 cr / 1200 s. Title "The tallyman's rematch"; brief positions it
as the ledger clerk answering Vesper's mark — same course, twice around, posted purse.
Grid line in the existing countdown register.

No new mechanics: laps-kind contract on a shipped level through `racingOfferFor`.
The crowd-line corpus does not exist in data (cataloged limitation); rival personality
fields are single strings, and the opponent/set-piece files are foreign — so the
contract row is the honest whole slice.

Verification: `test/racing-career.test.mjs` + `raceContractById` import smoke.

Review: plan ✓3 — recorded.
