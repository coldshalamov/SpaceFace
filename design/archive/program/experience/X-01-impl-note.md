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

Complete-with-evidence (devin-expu audit 2026-10-25): landed 6ab0d2eb2e (+9ab4054e32 review
fixes). `x01-salvage-bay-voice` 6/6 green today. Audit residuals 1-2 closed by the two hints,
comms tail and restricted-bay copy (verified `onboarding.js:794,797`, `cargo.js:1226`,
`344:339`); residual 3 (opt-in 344) is X-02's scope by row split. Rejected draft scope (Skeptic
pod, Drifter loot stamp, Accountant prove-it test) was adjudicated at plan time — no remaining
named sub-scope.
