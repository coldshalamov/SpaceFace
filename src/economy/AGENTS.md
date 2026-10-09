# src/economy/

Pure market, customs, freight, and resource-budget math. `src/systems/economy.js` is the only credits writer and the only stock writer.

- This folder must not mutate credits, cargo, heat, reputation, or station stock.
- Quotes return numbers or intent recipes. Callers emit `economy:grantCredits`, `economy:chargeCredits`, or `aiTrader:requestTrade`.
- `customsRisk` is the scan-chance and exposed-stack helper `runScan` already calls. Fine projection sums raw line products and rounds once, matching `runScan`.
- `economyResources` leases are work-seconds on the economy bag, not ore ids and not cargo.
- No `Math.random`, `Date`, or DOM.
