# FB-046 — The session sink ledger the economy already writes is readable

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: economy.js, seam: shipLedger.js, seam: footprint.js
**Write-set:** `src/systems/economy.js`, `src/systems/shipLedger.js`, `src/ui/screens/footprint.js`, `test/fb-where-the-money-went.test.mjs`

## The gap
`fileSessionSink` writes a 48-entry `player.sessionSinks` by `SESSION_SINK_KINDS`; the ledger has zero readers
repo-wide. `shipLedger.js` defines its own `SESSION_SINK_EVENT` phrase map and never points it at the real
ledger. "Where did my money go" is recorded and unreadable.

## Why this direction
A finance screen was rejected (no spreadsheet). The footprint board already reads the ship ledger; pointing
the existing phrase map at the real ledger and adding one roll-up row is enough.

## Mechanism
- Make `shipLedger.js` project `player.sessionSinks` through `SESSION_SINK_EVENT` into ledger entries (fees,
  fines, fuel, repair, upkeep, insurance) with a per-kind roll-up.
- Show the roll-up on the footprint board beside the provenance chains (functional edit).
- Pin that ten scripted sinks on seed 4242 produce ten entries and correct per-kind totals; the ledger stays
  capped at 48.

## Done when
`test/fb-where-the-money-went.test.mjs` pins entries and totals; `pq-149-03-story-so-far.test.mjs` stays
green.

## Do not
Do not add a new ledger. Do not raise the cap. Do not show NPC economics.

## Focus test starting points
- `test/pq-149-03-story-so-far.test.mjs`
- Locate footprint suites with `rg footprint test/`.
