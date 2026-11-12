# RATCHET: receiving work becomes the next journey

Base: PR #982, `fc6b4fa612f02ac5e71e4a5baa0e89d6999251e6`.
This is a receiving-crew conversation and navigation connection, not a fourth job, a relay installation or an additional reward.

## Source-linked toolbox and decision

- `src/features/rigWorkshop/jobs.js`: three finite physical jobs, original custody and receipts; `rigJobAvailability` requires at least one delivered original and settlement of both first jobs to unlock the relay. Closing an empty order is permanent, not evidence of completed work.
- `src/features/rigWorkshop/aftermath.js`: settled accounts resolve the live original receiver and paid originals still nearby. Added `workshopNextWork`, a read-only recommendation from the same job availability authority.
- `src/features/rigWorkshop/runtime.js`: existing `_showAftermath` offers the new on-request conversation only near the original receiver. Existing jobs `guide` remains the navigation owner. Bench route is plot-only, with no automatic flight, acceptance or payment.
- Original cradle, sled, collectors, bumpers and receiving gantries are reused. No model request or new body is warranted for this connection.

## Player journey

After a local receipt, the crew can explain what comes next. The Needle Orchard asks the pilot to fit a rig through a freight throat; kiln work instead asks the pilot to manage mass, balance and braking. With surviving deliveries on both records, the night shift offers the fragile coil and heavier housing of the Quiet Relay. The original workshop bench is the place to inspect remaining machinery and choose whether to accept the next order.

If another order is already open, the crew instead points to its current destinations. It does not replace the agreement. If a required earlier order closed empty, the crew tells the player honestly that the relay remains unavailable. After all orders are closed, the rig remains useful but the board supplies no repeat payout or respawn. Historical advice never asserts that the sled is still at the bench or that delivered cargo survives.

The conversation captures no durable state. Continue recomputes advice from saved jobs/receipts. Departure, receiver replacement or changed job state invalidates old card actions; rereading exposes the current next activity.

## Coverage and acceptance

`test/rig-work-handoff.test.mjs` covers real menu/action dispatch, native-owner fixture bodies, cold capture/restore, original bench course with autopilot false, unchanged money/stock/jobs/receipts, departure, changed work, empty closure, absent stock and no-load advice. Nearby prior tests are run through the same exact-parent overlay.

Fixture setup stages paid work and positions the player at the receiver. It is not an earned flight from New Game. No rendered composition, live UI, audio, autopilot safety or human navigation acceptance is claimed. No physics, seating, cargo or economy rules changed.

## Open goals

- **SF-WORLD-DIRECTION / SF-SECTOR-COHERENCE** — implemented, scoped-review candidate: physical receipts now explain the next journey. Owner: Adventure integration. Next: earned bench→Orchard→receiver→kiln trip, checking that the handoff is discoverable without opening irrelevant menus.
- **SF-LIVING-WORLD** — partial: receiving crews respond to actual work, not ticket closure alone. Next: rendered local arrival and repeat visit, including missing/destroyed original stock.
- **SF-GAME** — open: native menu and restore checks do not complete earned or visual acceptance; merge conflicts/CI belong to publication review. No user-dependent operation is newly required by this increment.
- **SF-ASSETBANK / SF-ASSET-QUALITY** — reuse only; no competing model-production task, no new assets counted.
