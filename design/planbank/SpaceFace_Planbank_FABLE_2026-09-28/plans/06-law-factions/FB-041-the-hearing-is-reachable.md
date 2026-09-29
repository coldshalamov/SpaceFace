# FB-041 — A promoted loss investigation offers the hearing set piece that already exists

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: lossInvestigation.js, seam: missions.js
**Write-set:** `src/systems/lossInvestigation.js`, `src/systems/missions.js`, `test/fb-hearing-reachable.test.mjs`
**Neighbours (extend, never restate):** SFQ-B075, SF-291

## The gap
`lossInvestigation.js` promotes a derelict salvage point into a communicator and emits
`lossInvestigation:promoted`, which has no listener. `SET_PIECE_MISSIONS` ships `witness_run` and `hearing`
chains and `orrinWitnessCase.js` exists. The court path is authored at both ends and unconnected in the
middle.

## Why this direction
`lossLedger.js` already proves the `mission:offered` pattern from a world event; one subscription in the
mission owner offers the hearing chain from the promoted communicator.

## Mechanism
- Listen to `lossInvestigation:promoted` in `missions.js` and offer the `hearing` set piece bound to the
  promoted communicator's loss id.
- Carry the loss provenance into the hearing's receipt so the verdict names the real loss.
- Pin that promotion offers exactly one hearing and that completing it closes the loss entry.

## Done when
`test/fb-hearing-reachable.test.mjs`: one offer per promotion on seed 4242, closure on completion;
`pq048-vonn-freight-loss-investigation.test.mjs` stays green.

## Do not
Do not add a courtroom screen. Do not offer hearings for losses the player did not investigate.

## Focus test starting points
- `test/pq048-vonn-freight-loss-investigation.test.mjs`
- `test/pq-152-01-set-pieces.test.mjs`
