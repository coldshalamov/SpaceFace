# M-09 plan — patrol/law events

Tribunal synthesis (Drifter + Archivist + Accountant):

**Slice**: three appended lines in `src/data/barkSituationFill.js` `faction_scn` cells —
inspector-type + citation-flavor + grudge-memory in one slice:

- `scan`: 'The sweep roster knows your hull by first name. The file prefers a number.'
- `demand-cargo`: 'This hold was audited once. The discrepancy was filed, not resolved.'
- `patrol-greeting`: 'Marker Twelve-K desk. Your wake is already on the board — behave
  for it.'

Appended under the existing S-01 third-shift comment so the desk-voice block reads as
one authored run. Index-0 shipped lines untouched; the foreign RC-CHASE runtime in
`lawSecurity.js` is preserved — runtime grudge/wanted machinery is cataloged as a
foreign-lane dependency, not duplicated.

Verification: `test/rc-sector-laws-4242.test.mjs` + import smoke on the fill module.

Review: plan ✓3 — recorded.
