# FB-124 — Cargo insurance is a real station service, not a line of bar fiction

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: economy.js, seam: serviceQuotes.js, seam: playerDefeat.js
**Write-set:** `src/systems/economy.js`, `src/ui/station/serviceQuotes.js`, `src/combat/playerDefeat.js`, `test/fb-cargo-insurance.test.mjs`
**Neighbours (extend, never restate):** SFQ-B086

## The gap
Hull insurance exists (`INSURANCE_DEFAULTS`, purchasable, honoured at death). `src/ui/station/barContacts.js`
writes fiction about cargo insurance and no such service exists; a death still loses 50% of non-persistent
cargo with no way to cover it.

## Why this direction
Mature parity where it fits: a per-trip cargo policy priced on manifest value and route danger, paid out at
the recovery dock, single writer economy.

## Mechanism
- Add a `+cargo_insurance` service in `handleService` priced from manifest value times the sector danger from
  `sectorSim`, valid until the next dock; the economy is the only credit writer.
- In `buildRecoveryPlan`, pay out the covered fraction of lost cargo value at the recovery dock and name it in
  the coverage sentence.
- Pin price, payout, single-trip expiry and no double payout after load.

## Done when
`test/fb-cargo-insurance.test.mjs`: policy bought, death pays the covered fraction once, expired policy pays
nothing; `station-services.test.mjs` stays green.

## Do not
Do not insure contraband. Do not let the policy survive a dock. Do not add a claims screen.

## Focus test starting points
- `test/station-services.test.mjs`
- Locate defeat suites with `rg buildRecoveryPlan test/`.
