<!-- LIFETIME: DURABLE -->
# Rhea's rescued seam miner survives Continue

This is a narrow correction to an existing living-world consequence, not a new worker controller or rescue economy. Published/tested/integrated/accepted remain separate states.

## Existing place and consequence

Rhea's Cinder Claim is authored as a DMC mining workplace: a scorch-seam miner, ore hauler, yard tender and thin escort work around the yard and slag faces. Its existing way-of-life copy says "Cut, load, run"; Sker approach raiders and the Collective claim watch provide the established pressure. The rescue-return owner already intends the same rescued person to return later to the same workplace, acknowledge the player once, and remain permanently lost if killed afterward.

Actual traffic placement materializes rhea_seam_miner as ship_pelican with durable world record wr_convoy_5a5360b9 and the real rhea_miner_yard_face → rhea_miner_slag_face job. No extra hull, new name, mission reward, faction history or asset was invented for this correction.

## Reproduced failure and fix

The existing finiteOr helper applied Number(null), producing0 for events that had never occurred. Actual Save.save('quick') and Save.load('latest') succeeded, but unoccurred returnedAtS, lostAtS and hailAcknowledgedAtS became epoch-zero timestamps. The pending rescued worker consequently never returned after its due time. The same normalization also made the first thank-you look already acknowledged and made the first final death look already recorded. A no-load control returned exactly one worker.

The sole production change is a null/undefined guard before numeric coercion in src/systems/rescuedWorkerReturn.js. Real zero remains a valid event time. Existing numeric strings, false/empty-string legacy coercion, invalid-value fallbacks and optional workplace timing/default semantics are preserved. No Save schema, migration, traffic, job kernel, uniqueWrecks, survivorPod, contact-hail, economy or physical authority is rewritten.

This prevents corruption when normalizing originally nullable saved records. It does not guess whether a zero in an already-resaved corrupted record was genuine, and does not claim automatic repair of such records.

## Evidence

Base cec514c06b17b2cead29febb836c494da63e3e35; source baseline8fc10610de9e52520fe34736b4bc0bce8d60919b. Candidate source614c960256b9f8fdf42c4c489a6cb2c68269c130; new test ed0215531fb0e9504dc2c2988c40d347af242904.

- Exact new test against unchanged source:15 pass,7 fail. Fixed source:22/22 pass.
- Existing owner regressions: pb-cons-b-rescued-return5, sfq-build-rescued-return-retry1, next-wave-nxb-0423:9/9 pass.31distinct cases total; reviewer/root reruns overlap.
- Independent review passed22cases and a separate scalar comparison of13input categories across six lifecycle timestamps, seven workplace phases and speed. No blocking source finding.
- Source-qualified focused run:991ESM inputs; effective manifest SHA256543b51d0b49b740a10297a755f3fa90d4340559a5199c55294b66a869f50534e. Raw candidate log SHA256dfc543c5f21c0764caddb6063de1d52109515a174e72346447285ed7a7567e00. This is not a complete arbitrary filesystem/installed-dependency audit.

Tests exercise actual authored Rhea materialization, original job assignment, real Save/Continue before rescue and before return, actual restored/remapped hull identity, exactly one return event and one hull, repeated receipts, actual hail availability/offer, acknowledgement across another Continue, final loss and no resurrection, and closed ransom/abandon outcomes. They use explicit casualty/ejection/rescue events and directly change current-sector state; this is not native combat, personally flown rescue or a full world-transition proof.

Rejected fixture attempts reused stale pre-Continue hulls. Final tests instead select the actual restored hull; the rejected attempts are retained. Root's first --test invocation of the private layered diagnostic loader failed source qualification due to duplicate loader registration, not a gameplay assertion. Running the node:test module directly through that loader is the supported local diagnostic route. Shipping test imports remain ordinary repository-relative paths and the package gate uses normal node --test without the private loader. No aggregate suite or forbidden anvil route was run.

Current full production-worker startup separately remains blocked by the missing public onboarding/powerSituations.js import documented in PR523; this fix does not stub it or claim full production boot. Native flight, visible acknowledgement, game-camera quality, target-device performance and full sector acceptance remain open.

## Ownership and delivery

Only src/systems/rescuedWorkerReturn.js, test/rescued-worker-continue.test.mjs, one explicit package gate and this report change. Root checked filenames across45openPRs05:34 UTC: no overlap with the source or new test; current NOW had no active owner for these exact paths. Existing rescue/save/runtime owners remain untouched. All original game and living-world goals remain open.
