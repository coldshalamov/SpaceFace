# FB-127 — Career origins offered, chosen or declined and ladder steps are recorded in the ship ledger

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: haulerOriginSystem.js, seam: ladderShared.js, seam: shipLedger.js
**Write-set:** `src/careers/origins/haulerOriginSystem.js`, `src/careers/ladders/ladderShared.js`, `src/systems/shipLedger.js`, `test/fb-career-ledger.test.mjs`
**Neighbours (extend, never restate):** SFQ-B118

## The gap
`career:origin:offered`, `career:origin:declined` and the ladder choose/abandon/recover events are emitted
with no listener; the ship ledger has nine entry types and none for the career the player chose or refused.
The career becomes the ending's origin identity and leaves no trace in the player's own record.

## Why this direction
The ledger is the memory surface; one entry type per career decision, projected from events the systems
already emit.

## Mechanism
- Add a `career` entry type in the ledger templates; subscribe the ledger builder to the origin and ladder
  events (the constant-named ladder events through `ladderShared.js`).
- Record offered-and-declined as one entry so the player can read the road not taken.
- Pin one entry per decision on a scripted seed-4242 career walk and no duplicates after load.

## Done when
`test/fb-career-ledger.test.mjs`: offered, declined, chosen and one ladder step each produce one entry;
`career-ladders-contract.test.mjs` stays green.

## Do not
Do not branch careers on ledger state. Do not add a career screen. Do not exceed the ledger cap.

## Focus test starting points
- `test/career-ladders-contract.test.mjs`
- `test/pq146-02-titles-ledger-bark.test.mjs`
