# FB-047 — The trade ledger keeps a lifetime margin per commodity, not the last ten trades

**Kind:** deepening · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: economy.js, seam: marketIntelligence.js
**Write-set:** `src/systems/economy.js`, `src/ui/marketIntelligence.js`, `test/fb-lifetime-margins.test.mjs`
**Neighbours (extend, never restate):** NXB-026, SF-107, SF-115

## The gap
`TRADE_LEDGER_MAX = 10`: only the last ten trades survive, so there is no session profit and no per-commodity
lifetime margin, though `recordTradeLedger` computes FIFO cost basis and margin per sale.
`tradeMarginReceipts` renders what survives. Adjacent to SF-107/SF-115 (net profit by affordable load;
operating costs), which are quote-time numbers, not the record.

## Why this direction
Raising the cap alone was rejected (save growth). A bounded roll-up per commodity (count, units, total margin,
best and worst) alongside the ten receipts is small and durable.

## Mechanism
- Add `+player.tradeMargins[commodityId]` roll-ups written by `recordTradeLedger`, bounded by the commodity
  count (47).
- Extend `tradeMarginReceipts` to return the roll-up beside the ten receipts; the market intel view reads it
  (functional edit).
- Pin the roll-up after 30 scripted trades on seed 4242 and that save size grows by a bounded constant.

## Done when
`test/fb-lifetime-margins.test.mjs`: totals correct after 30 trades, save growth bounded;
`save-growth-dock-trade-flat.test.mjs` stays green.

## Do not
Do not raise `TRADE_LEDGER_MAX` above 20. Do not store per-trade history beyond the receipts. Do not add a
chart screen.

## Focus test starting points
- `test/save-growth-dock-trade-flat.test.mjs`
- `test/pq-183-01-watchlist.test.mjs`
