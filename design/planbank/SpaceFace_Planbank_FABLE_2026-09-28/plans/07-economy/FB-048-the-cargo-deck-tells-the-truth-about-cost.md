# FB-048 — The cargo deck reports the real cost basis of the hold instead of zero

**Kind:** CHECK · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: cargoDeck.js, seam: economy.js
**Write-set:** `src/ui/navigation/cargoDeck.js`, `src/ui/navigation/localSpaceMapModel.js`, `test/fb-cargo-deck-cost-basis.test.mjs`
**Neighbours (extend, never restate):** NXI-101

## The gap
`heldCargoLots` in `src/ui/navigation/cargoDeck.js` hardcodes `costBasis: 0`, while `consumeTradeLots` in
`economy.js` holds the real FIFO queue in `player.tradeLots`. The deck lies about what the hold cost, and
`localSpaceMapModel.js` consumes the field.

## Why this direction
Reproduce first: this is a defect in a live readout, not a feature. The fix is to read the FIFO lots that
exist.

## Reproduction gate
- Reproduction gate: on seed 4242 buy 20 units at Helios, open the cargo deck model and assert `costBasis`
  equals the paid unit price; today it is 0.
- Fix: compute the weighted average of `player.tradeLots[commodityId]` in `heldCargoLots`; expose it to the
  local space map model unchanged.
- Pin the reproduction as the focused test so it cannot regress.

## Done when
`test/fb-cargo-deck-cost-basis.test.mjs`: cost basis equals the FIFO average after two buys at different
prices; the local map model shows the same number.

## Do not
Do not average across commodities. Do not change `consumeTradeLots`. Do not add a second lot store.

## Focus test starting points
- Locate cargo-deck suites with `rg cargoDeck test/`; `test/pq-183-01-watchlist.test.mjs` for the price-reading
  path.
