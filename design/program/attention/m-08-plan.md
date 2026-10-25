# M-08 plan — black flag path

Tribunal synthesis (Drifter + Archivist + Skeptic):

**Slice**: append four hails to `MARK_HAIL_LINES` in `src/data/bountyMarks.js` —
wanted-poster texture in the mark's own voice, leaning on shared world-vocabulary
(the Scar's rate, the signing desk, the poster itself):

- 'The Scar pays late. My friends pay tonight. Read the room, courier.'
- 'A Holt signature on the writ means somebody at customs wanted you slow, not caught.'
- 'Poster says armed. Poster lies about which hull.'
- 'Framed, my last writ is worth more than the bounty on this one.'

Honest limit: the arc itself (contacts/yards/encounter acts/fence `lines` keys) is
keyed-closed or foreign-dirty — cataloged for a later pass; wanted texture is the honest
slice. `blackFlagMissions.js` settle_title hunk untouched.

Verification: `test/black-flag-missions.test.mjs` + seeded-pick determinism smoke.

Review: plan ✓3 — recorded.
