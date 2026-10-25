# X-01 impl note — salvage bay loop voice

Copy-only per plan: `FIRST_USE_LINE` gains `firstSalvageBay`/`firstSalvageCashIn`;
onboarding listens on `salvage:changed`/`salvage:bayCashedIn` (rail deferral rides the
existing `_showHint` voice gate); the restricted-bay toast now reads "Lawful docks won't
buy it"; the 344 defended comms tail names the bay. `en-US.generated.js` regenerated.

Tests: new `test/x01-salvage-bay-voice.test.mjs` 5/5. Keep-green 54/59 — the 5
`opening-hauler-raid`/starter-world failures are pre-existing foreign encounter drift
(verified identical with my comms line reverted); `check-encounter-director` fails on
its quiet-time soak for the same reason. `index.generated.js` foreign pro-yard diff left out.
Review fix: the post-cash-in `salvage:changed` now carries `cashIn:true` and the fill hint
skips it — a mixed bay's leftover no longer re-offers "Dock to cash it" at the berth.
