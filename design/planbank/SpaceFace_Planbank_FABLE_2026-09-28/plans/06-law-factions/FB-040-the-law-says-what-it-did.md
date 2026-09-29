# FB-040 — Fourteen silent law receipts get a voice where they matter to the player

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: barkDirector.js, seam: lawSecurity.js, seam: barks.js
**Write-set:** `src/systems/barkDirector.js`, `src/data/barks.js`, `test/fb-law-receipts-voiced.test.mjs`
**Neighbours (extend, never restate):** SFQ-B112, SF-161

## The gap
`lawSecurity.js` emits `law:fineAssessed`, `law:response`, `law:responseDeferred`, `law:distressRaised`,
`law:incidentReceipt`, `law:incidentResolved`, `law:sanctuaryWithdrawal`, `law:voice` and the warrant
release/defer family with no listener. `barkDirector.js` already listens to four law events. Adjacent to
SF-161 (a warrant with a plausible end); this is the voice of the steps, not the ending.

## Why this direction
The bark director is the one voice writer and already has the register; six more rows is a data change plus
subscriptions.

## Mechanism
- Add bark rows for `law:fineAssessed`, `law:sanctuaryWithdrawal`, `law:responseDeferred`,
  `law:incidentResolved`, `law:wantedWarrantReleased` and `law:distressRaised` in `barks.js`, in the lawful
  register, one line each.
- Subscribe in `barkDirector.js` with the existing ambient gap and the voice arbiter priority for law.
- Pin one bark per event on a scripted incident on seed 4242 and none for events the player did not witness.

## Done when
`test/fb-law-receipts-voiced.test.mjs`: six events, six barks, correct register;
`bark-director-quiet-latch.test.mjs` and `law-kill-witness.test.mjs` stay green.

## Do not
Do not voice every law event. Do not exceed the ambient gap. Do not add a law log screen.

## Focus test starting points
- `test/bark-director-quiet-latch.test.mjs`
- `test/law-kill-witness.test.mjs`
