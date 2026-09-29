# FB-045 — The market says why a price moved and which station is starving

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: economy.js, seam: marketNews.js, seam: market.js
**Write-set:** `src/systems/economy.js`, `src/ui/marketNews.js`, `src/ui/station/screens/market.js`, `test/fb-why-the-price-moved.test.mjs`
**Neighbours (extend, never restate):** SFQ-B081, NXI-108

## The gap
`economy:demandShift` (from `_noteDemandShift`) is the computed "why the price moved" signal and has no
listener. `starvedIndustryNeedFor` in `economy.js` computes which input a station lacks and has zero UI
consumers. The forecast cone and regime labels are wired; the cause is not.

## Why this direction
A market tutorial was rejected. The ticker already renders regime headlines from `REGIME_TEMPLATES`; a
demand-shift headline with its driver and a starved-need sub-line on the market row are two readers of numbers
that exist.

## Mechanism
- Subscribe `marketNews.js` to `economy:demandShift` and publish a headline naming the commodity, the direction
  and the driver (event, trade pressure, regime turn) with the event as citation.
- Render `starvedIndustryNeedFor` as the sub-line of the affected commodity row in `market.js` (functional edit,
  ORRERY-consistent).
- Pin one headline per shift and the starved line only while the need is unmet.

## Done when
`test/fb-why-the-price-moved.test.mjs`: a scripted shortage on seed 4242 yields one headline with a driver and
one starved sub-line that clears after delivery; `economy-demand-integration.test.mjs` and
`inf-freight-short-news.test.mjs` stay green.

## Do not
Do not expose hidden demand curves numerically. Do not add a market analytics screen. Do not publish uncited.

## Focus test starting points
- `test/economy-demand-integration.test.mjs`
- `test/inf-freight-short-news.test.mjs`
