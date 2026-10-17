Implemented M15: players can buy replacement parts or salvage the claimed workpiece, recover from bad deliveries, and restore actual station stock with payment, one durable receipt, and a 180-second price correction.

This reuses the existing salvage/delivery lifecycle. Restoration follows the economy writer’s confirmed freight receipt; `economy.js` is unchanged.

Files changed:

- `src/data/economyContractTemplates.js`
- `src/systems/economyContracts.js`
- `src/systems/missions.js` — M15 hunks only; concurrent edits preserved.
- `test/m15-shortage-at-the-gate.test.mjs`

Validation:

- `m15-shortage-at-the-gate.test.mjs`: **8 passed, 0 failed**.
- Neighboring `first-trade-contract`, `mission-salvage-claim-site`, `inf-econ-11-contract-delivery-stock`, `nxi-169-stale-shortage-offer-retired`, and `nxi-108-shortage-relief` tests: **16 passed, 0 failed**.
- Simulation comparison: uninterrupted/reload hashes match; an expected-golden hash difference remains.

The broader adventure gate **failed before gameplay** because local-page navigation timed out. Browser acceptance remains unverified; [verdict](scratch/player-truth/adventure/verdict.md) and [contact sheet](scratch/player-truth/adventure/contact-sheet.jpg). These adjacent verification issues were left unchanged.

Edits remain uncommitted, as required by the campaign constraints.