# Task INF-A — three INFERENCE catalog units: ECON-09, ECON-10, ECON-11 (one bounded batch)

Read first: `_constraints-codex.md`, and the three catalog lines ECON-09, ECON-10, ECON-11 in
`design/program/INFERENCE_IDEAS.md` (they name the player-visible change, the owner files, the
done check, and what not to invent). The law for this batch: `design/program/INFERENCE_LANES.md`
§0.1 — the line is already considered; do not expand it into a new system; share scenario setup
across the batch; each line keeps its individual done sentence and its own focused test.

## The three lines (owner family: `src/systems/economy.js` + `src/systems/missions.js` + market UI row rendering)

- **ECON-09** — a bought-out listing reads SOLD OUT with its restock word instead of vanishing
  (`src/ui/station/screens/market.js`, `src/systems/economy.js`). Seed 4242: a zero-stock row
  stays listed and names the restock estimate; pin the row before and after restock.
- **ECON-10** — selling into a posted shortage pays the posted premium and the receipt says so
  (`src/systems/economy.js`, `src/systems/missions.js`). Pin the premium line on a relieving sale
  and its absence on a normal sale.
- **ECON-11** — freight you delivered under contract shows up in that station's stock
  (`src/systems/economy.js`, `src/systems/missions.js`). Pin stock before/after a ten-unit
  contract delivery.

Single-writer law: `economy.js` is the credits/stock writer — implement inside it or through its
existing API; the UI reads, never writes.

## Done when

- Three focused tests: `test/inf-econ-09-sold-out-row.test.mjs`,
  `test/inf-econ-10-shortage-premium-receipt.test.mjs`,
  `test/inf-econ-11-contract-delivery-stock.test.mjs`, each pinning exactly its catalog line's
  done check (both branches where the line names two).
- No new events invented when an existing owner emits something usable.
- Report wording you added verbatim in your final message (the orchestrator runs a separate
  taste pass over player-visible strings).
