# X-05 impl note — read the owner before the act

Barge titling now stamps `ownerName` beside `ownerId` (cutter resolved through
`state.traffic.freighters` rows → `state.entities`, fallback 'Claim crew'); `cargoPodOwnerId`
is exported from lawSecurity; onboarding's post-rail update scans pickups/payloads every 15
ticks for the first other-owned lot inside 220 wu and speaks `firstOwnedGoods` anchored to it
(`rock` attach). Tests: `x05-owner-read-before-act` 6/6; keep-green 68/73 — the five
opening-raid lifecycle failures are the same foreign director drift carried since batch 1.

Complete-with-evidence (devin-expu audit 2026-10-25): landed e417abde7c (+2b1c283222,
04f119429d, 3a2a46bee9 review fixes — owner read speaks only over titled lots; plan pins #5/#6).
`x05-owner-read-before-act` 11/11 green today. Audit residuals (unreadable ownership before the
act, titled chips nameless) closed by `ownerName` at title time (`trafficRoleOps.js:971`) +
the `firstOwnedGoods` read (`onboarding.js:1947-1976`, exported `cargoPodOwnerId`). The
Accountant's 1207 day-2 scheduling is parked as a separate row candidate (plan non-goal); the
Skeptic's victim-witness and Drifter's Kettle Nine encounter were adjudicated away at plan
time — no remaining named sub-scope inside this row.
