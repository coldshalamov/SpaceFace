# Task MJ1 — board row 348: M15 "Shortage at the gate" (ADMIT-SFQ-M residual)

Read first: `_constraints-codex.md` (all of it), the mission brief
`design/finish-expansion-2026-09/missions/M15.md`, and the disposition row for M15 in
`design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residual (from the official disposition)

Shortages are already modeled (`src/data/sectors.js`, `src/data/newsTemplates.js`); the missing
piece is turning one into a **delivery + repair offer**: contract generation in
`src/systems/economyContracts.js` / `src/data/economyContractTemplates.js` (the contract single
writer). Follow the brief: expose real prerequisites before charging money; keep a decline/abort
and a recovery path; a bad delivery leaves a recoverable job, not a closed mandatory gate; reward
is payment plus actual route/service restoration and a finite price correction. Two approaches:
buy and deliver the correct component, or salvage an equivalent workpiece with more handling risk.
Use the ordinary contract/mission surfaces (no new mission engine).

## Done when

- A posted sector shortage at a gated industrial stop generates a real contract offer the player
  can accept from an ordinary surface, decline, fail partially, and recover from.
- On completion the station's listed stock/service actually restores and one receipt names the
  restoration (this pairs with the economy truth-telling units landing in the same campaign —
  do not edit `src/systems/economy.js` itself; emit through the contract writer's existing API).
- Focused seed-4242 test `test/m15-shortage-at-the-gate.test.mjs` pins: offer generation from a
  shortage, the two completion approaches (buy vs salvage), partial-failure recovery, and the
  stock/service restoration event.
