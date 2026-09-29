# FB-050 — A pinned commodity can carry a target price and says when it crosses

**Kind:** build · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: watchlist.js, seam: marketDriverPresenter.js
**Write-set:** `src/ui/watchlist.js`, `src/ui/watchlistHud.js`, `test/fb-price-alerts.test.mjs`

## The gap
Pins exist (continuous HUD receipt lines, persisted as `uiWatchlist`); threshold alerts do not.
`marketQuoteValue` is already imported by `watchlist.js`, so a pin plus a target is one comparison at the
cadence the price forecast already uses. Adjacent to SF-252 (an alert that offers a recovery action), which is
about failure alerts.

## Why this direction
A notifications system was rejected. Visited-only knowledge, one comparison on `dock:docked` and
`sector:enter`, one line on the HUD.

## Mechanism
- Add an optional `target` and `direction` to a pin; compare on dock and sector entry using `marketQuoteValue`
  for stations the player has visited.
- Announce a crossing once through the watchlist HUD line and the news voice; re-arm only after the price
  crosses back.
- Pin the once-only announcement and that unvisited stations never trigger.

## Done when
`test/fb-price-alerts.test.mjs`: one announcement per crossing on seed 4242, none for unvisited stations, pins
persist with targets; `pq-183-01-watchlist.test.mjs` stays green.

## Do not
Do not read prices the player has not seen. Do not add a market alert screen.

## Focus test starting points
- `test/pq-183-01-watchlist.test.mjs`
