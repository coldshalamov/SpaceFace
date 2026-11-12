# A shift can end before a wreck is empty

Parent: `6592109309fe1f1942870f491cffe08a0f7b6a9e`, PR #982.

## Player decision

The first-shift change made useful 18-mass/16-mass originals reachable with starter equipment. Its follow-through still behaved like a compulsory whole-wreck checklist: after handover the command reopened the retired component, and after the two sorting loads the foreman immediately recommended heavier remnants. That undermines the established promise that each original pays separately and that leaving paid work is legitimate.

This increment makes the existing ticket acknowledge an earned stopping point. After the motor, the ticket points to the still-live cassette. After both paid originals, it states the actual two receipts against the claim fee, identifies the remaining frame and saddle at their actual mass, and puts parking first. The player may instead inspect either heavier original and continue. No whole-job completion, free reward, repair, tow, replacement lot or new unlock occurs. Ceres receives the same material through the existing stock-pressure transaction.

The wider opening should make three kinds of work distinct: sorting hardware is an attainable first shift; BELLWETHER asks for ordered extraction through a crowded cage; VESPER makes pressure and fragile machinery consequential. This does not collapse those latter activities into a starter checklist or prescribe spending the earnings on an unverified upgrade.

## Toolbox and implementation evidence

- [guidance.js](../../src/features/shipbreakingYard/guidance.js): existing live assembly advice remains unchanged. New closeout reads both original receipts, their job/module identities and surviving remnants. No extra saved quest counter can disagree after Continue. Historical variants 0–5, lost loads and abandoned/complete claims do not get the sorting closeout.
- [runtime.js](../../src/features/shipbreakingYard/runtime.js): successful handover returns to the current work ticket rather than the retired part. Existing park, inspect, abandonment confirmation and resume owners retain authority. The closeout is content in the existing decision deck, not a new overlay or UI system.
- [model.js](../../src/features/shipbreakingYard/model.js), unchanged: terminal part status, receipts and ownership remain the only durable truth. Parking does not freeze a loose body. The ticket explicitly warns about drift and points to the already-existing transport clamp if needed.
- [layouts.js](../../src/features/shipbreakingYard/layouts.js), unchanged: original postal/sorting assets, exact physical masses and prices are reused. No asset request is justified.
- [focused checks](../../test/shipbreaking-shift-closeout.test.mjs): native fixtures release both exact originals and exercise the command owner, receipts, real retirement, park/resume, duplicate handover rejection and the returned ticket. Receiver approach is staged by test positioning: this is NOT an earned two-load flight or visual review. Serialization checks cover derivation only, not a new whole-game Continue run.

## Open-goal continuation

| Marker | Intended outcome / state | Owner, evidence, next action |
|---|---|---|
| SF-WORLD-DIRECTION | Ceres pays for useful material, not obedience to a completion checklist. Implemented candidate; acceptance open. | Experience editor; receipt-derived shift closeout. Next: earned two-load flight and first return to Ceres. |
| SF-SECTOR-COHERENCE | Arrival → claim → motor → cassette → voluntary departure/return. Candidate source and command checks. | Experience integration; live ticket handoff. Next: verify ordinary station approach and readable routes in a rendered build. |
| SF-LIVING-WORLD | Remaining purchased hardware and receipts survive the player's decision to leave. Existing owners preserved. | Runtime integration; park/resume and identity checks. Next: earned departure/Continue/return with a loose remnant, including drift. |
| SF-GAME | Starter shift ends with agency; heavier work stays available. Tested candidate, not accepted. | Final reviewer; no automatic closure/reward. Next: review long ticket fit and pacing on actual game camera. |
| SF-ASSETBANK / SF-ASSET-QUALITY | Review/integration only. No new production request. | Local model agents retain model ownership. No visual assessment performed in this run. |

No user operation is needed for these authorized candidate edits. Visual/earned-play acceptance remains open, and publication is separate from this source packet. Original twenty-concept scope, unrelated lanes and both automation schedules are unchanged.
