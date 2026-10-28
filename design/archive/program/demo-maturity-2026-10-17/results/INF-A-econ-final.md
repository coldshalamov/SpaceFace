- **ECON-09:** Depleted listings show SOLD OUT and a restock estimate, then recover normally.
- **ECON-10:** Shortage sales pay the quoted price and identify its included premium; normal receipts omit it.
- **ECON-11:** Already implemented: contract freight reaches station stock. Added the ten-unit delivery regression.

Pricing and recovery math remain unchanged. Economy captures premium attribution before the sale updates stock; no new events were added.

Changed files:

- `src/systems/economy.js`
- `src/ui/station/screens/market.js`
- `src/ui/views/marketPresentation.js`
- `src/ui/station/tradeReceipt.js`
- `test/helpers/infEconomyScenario.mjs`
- `test/inf-econ-09-sold-out-row.test.mjs`
- `test/inf-econ-10-shortage-premium-receipt.test.mjs`
- `test/inf-econ-11-contract-delivery-stock.test.mjs`

Requested tests: **tests 3 · pass 3 · fail 0**. With related regressions: **45 passed, 0 failed**. Label checks passed; rendered sold-out text was inspected.

Added wording, verbatim:

- `SOLD OUT`
- `SOLD OUT · Restock ~{seconds}s`
- `Restock pending`
- `Shortage premium`
- `Included in sale price`
- ` · Shortage premium included in sale price`

Adjacent findings: the UI walk reported some no-op controls. Simulation comparison matched uninterrupted/reload hashes but reported a stored expected-hash difference. Neither was changed.

Left edit-only for the orchestrator; no staging or commits.

