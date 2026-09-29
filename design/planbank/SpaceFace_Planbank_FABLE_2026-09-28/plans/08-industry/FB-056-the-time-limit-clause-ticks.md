# FB-056 — The authored time-limit clause is offered and enforced on the deadlines missions already carry

**Kind:** wire · **Lane:** THE LONG GAME · **Routing:** open
**Seam tags:** seam: contractClauses.js, seam: missions.js
**Write-set:** `src/systems/contractClauses.js`, `src/data/contractClauses.js`, `test/fb-time-limit-clause.test.mjs`
**Neighbours (extend, never restate):** NXB-039, NXI-153, SFQ-B072

## The gap
`CONTRACT_CLAUSES` authors `time_limit` (×1.05) and its own note states no system emits it, so `attachClauses`
filters it out of generated offers. Missions already carry `m.deadline_s`. Separately `contract:clauseHonored`
is emitted with no listener, so an honoured clause earns its research point through a grant table rather than
a receipt the player sees.

## Why this direction
One tick in the clause system closes a clause that was written and never lived; a listener on the honoured
event gives every clause a receipt.

## Mechanism
- Tick `time_limit` in `contractClausesSystem` against `m.deadline_s`; breach on expiry, honour on completion
  before it.
- Remove the filter so generated offers can carry `time_limit`.
- Give `contract:clauseHonored` a listener that posts a one-line receipt through the mission log path and keeps
  the research grant.

## Done when
`test/fb-time-limit-clause.test.mjs`: offer carries the clause, completion before deadline honours with the
receipt and the point, after deadline breaches; `pq-152-03-twist-clauses.test.mjs` stays green.

## Do not
Do not add clauses. Do not change pay multipliers. Do not double-grant the point.

## Focus test starting points
- `test/pq-152-03-twist-clauses.test.mjs`
- `test/depth-program-sp1-clauses.test.mjs`
- `test/research-grants.test.mjs`
