# M-03 plan — authored encounters

Tribunal synthesis (Drifter + Archivist + Set Dresser):

**Slice**: append authored lines to three `ENCOUNTER_BARKS` corpora in
`src/data/encounters.js` — `bounty_notice` (+2, hunter grumbling about the posting),
`ambush_spring` (+2, the lane being recognized as set), `convoy_depart` (+2, crews
talking shop on the way out). Seeded picks stay deterministic; index-0 shipped lines are
untouched.

Why not squad/manifest/outcome tables: those change mechanics or are keyed-closed.
This is the corpus the encounter system already routes to the radio.

Verification: `test/black-flag-content-ui.test.mjs`? No — the corpus is encounter-side.
Use `test/encounter-barks` if present, else the encounters catalog test; confirm import
and that `bark in ENCOUNTER_BARKS` validation still holds for 040.

Review: plan ✓3 — recorded.
