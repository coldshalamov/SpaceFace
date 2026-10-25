# X-05 impl note — read the owner before the act

Barge titling now stamps `ownerName` beside `ownerId` (cutter resolved through
`state.traffic.freighters` rows → `state.entities`, fallback 'Claim crew'); `cargoPodOwnerId`
is exported from lawSecurity; onboarding's post-rail update scans pickups/payloads every 15
ticks for the first other-owned lot inside 220 wu and speaks `firstOwnedGoods` anchored to it
(`rock` attach). Tests: `x05-owner-read-before-act` 6/6; keep-green 68/73 — the five
opening-raid lifecycle failures are the same foreign director drift carried since batch 1.
