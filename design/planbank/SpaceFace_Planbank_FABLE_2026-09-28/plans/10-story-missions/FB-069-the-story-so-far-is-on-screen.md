# FB-069 — The doing/then/so prose the ship ledger already renders reaches the ledger panel

**Kind:** wire · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: shipLedgerPanel.js, seam: shipLedger.js
**Write-set:** `src/ui/shipLedgerPanel.js`, `test/fb-story-so-far-on-screen.test.mjs`

## The gap
`renderStorySoFar` and `formatStorySoFarProse` in `shipLedger.js` produce the story-so-far prose and
`buildShipLedger` returns it as a field; the only importer of the render is `telemetry.js`.
`shipLedgerPanel.js` is mounted in two hosts and already calls `buildShipLedger`. Pure UI, hence the ORRERY
lane.

## Why this direction
The field is already returned; the panel omits it.

## Mechanism
- Render the `storySoFar` field at the head of the ledger panel in both hosts.
- Walk both hosts with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-story-so-far-on-screen.test.mjs`: the panel model carries the prose for a seed-4242 save with three
ledger entries; `pq-149-03-story-so-far.test.mjs` stays green.

## Do not
Do not recompute prose in the UI. Do not add a third host.

## Focus test starting points
- `test/pq-149-03-story-so-far.test.mjs`
