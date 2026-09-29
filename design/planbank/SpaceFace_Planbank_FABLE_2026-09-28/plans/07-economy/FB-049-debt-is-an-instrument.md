# FB-049 — A loan can be taken, a balance can be seen, and a stale debt is announced

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: economy.js, seam: serviceQuotes.js, seam: marketNews.js
**Write-set:** `src/systems/economy.js`, `src/ui/station/serviceQuotes.js`, `src/ui/marketNews.js`, `test/fb-debt-instrument.test.mjs`
**Neighbours (extend, never restate):** SFQ-B086, SF-164, NXB-044

## The gap
`player.debt` exists, ages into a bounty daily (`_onDebtStaleDay` at 25%/day) and emits
`economy:debtEscalated` to nobody; no UI file mentions debt. There is no way to take a loan and no surface
showing the balance. Debt is a punishment, not an instrument. Adjacent to SF-164 (a debt settled through an
appropriate job): that is one settlement route; this is the instrument and its receipts.

## Why this direction
A bank screen was rejected. `handleService` is the station-service switch that already debits and credits; a
`loan` row in `serviceQuotes.js` plus a `settle` row, and the existing interest clock, is the whole feature.

## Mechanism
- Add `loan` (bounded by net worth and rep) and `settle` service types in `economy.js` `handleService`, written
  only by the economy (single writer of credits).
- Add the two rows to `serviceQuotes.js` with the balance and the daily escalation shown in the quote
  (functional edit).
- Give `economy:debtEscalated` a listener in `marketNews.js` (a cited headline) and a HUD annunciator hook
  through the existing alerts path.

## Done when
`test/fb-debt-instrument.test.mjs`: loan credits once, settle clears, escalation posts a bounty and one
headline after `DEBT_STALE_DAYS`; `custody-settles-debt.test.mjs` stays green.

## Do not
Do not let any other system write credits. Do not add compound interest beyond the existing daily rule. Do not
gate the story on debt.

## Focus test starting points
- `test/custody-settles-debt.test.mjs`
- `test/station-services.test.mjs`
