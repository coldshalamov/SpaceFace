<!-- LIFETIME: DURABLE -->
# Nyx clinic welcomes clean carriers

## Existing place and the missing connected experience
Hesper Quill is Nyx's authored pharmacist. Her opening line says “Warrant or no warrant”; her existing work moves food and medicine at a lower pay multiplier, without a setup ambush. Nyx's station is placed at(-880,540), connected to Hyperion, Kepler and Pallas. The existing saved relationship already supports ordinary jobs, trust, longer runs and a three-stop Hyperion→Ceres→Tethys medical route with a10Quiet reputation reward.

But actual bar projection hid Hesper on a clean first visit. A trusted clean carrier could see her, only to hear “Nothing for a clean hull. Come back hot.” The player had to become wanted to access the supposedly warrant-independent clinic relationship.

## Implemented player route
A clean first arrival now discovers Hesper through the existing contact generator and first-meeting owner. The clinic posts the existing sealed food/medicine delivery through the existing board and mission authority, without pretending the pilot is wanted. A clinic-specific title and summary explain the work and preserve normal berth, cargo and law checks; generic ambush prose no longer misdescribes her no-setup job.

Completing real deliveries earns the existing payout and trust. Two actual settlements reach the existing trust threshold and expose the existing medical route. Each completed leg unlocks the next, through Hyperion, Ceres and Tethys. The saved Hesper routeDone receipt prevents a second10Quiet reward; ordinary clinic work resumes afterward. This is once per that saved fence ledger, not a global achievement across New Game or reset saves.

Pending, accepted/running and completed progress survives Save/Continue. Full holds, unavailable boards, active onboarding and existing route state still gate offers. No-work copy points to hold room and board availability rather than demanding criminal heat. Other fences retain their existing wanted/relationship gating; Hesper's exception is explicit and local.

## Existing authorities and limits
Three production owners change: economyContracts, fenceContact and fenceDesk. The existing clinic-shaped sealed-freight builder is selected locally for Hesper; global template selection is unchanged and the lookup fails closed if its authored template is absent. Real heat and wanted state are preserved. Accepted clinic jobs keep setup ambush chance0 and hitfalse, while the ordinary law owner still arms an untipped pending warrant wave. No law immunity, new registry, clock, schema, mission family, reward table or failure penalty is added.

This builds on PR532's already-published no-betrayal fix. The barContacts integration itself is not edited, preserving PR523's papers-service work and active stationApp ownership.

Cargo custody and settlement rules are not rewritten. Missing freight cannot produce a payout or success. A short manifest retains the existing proportional payout AND completion/trust receipt; this is not full-manifest-only trust. Failed non-ambush jobs keep their existing trust policy. Unrelated fences, risk-driven ordinary field jobs and wanted deniable jobs remain covered.

## Evidence and review
Composition: public master93706e9ff07563af29461ea4b4d65486b710ee7d plus published PR532 no-tip sourceb11014bb9490d5683cfef8486c0574e27055c1d2, then these scoped changes.

- New connected clinic suite:15/15; matched prior-PR532 baseline3pass/12fail.
- Existing fence compatibility:33/33. The one former blanket assertion that every clean unknown fence is hidden now has only the intended Hesper exception; the other32cases are unchanged. Its pre-update32/33 result is retained.
- Existing economy risk:7/7; wanted deniable jobs:10/10; prior clinic carrier-trust guarantee:10/10.
- Total75distinct cases on final source. Reviewer/root reruns overlap rather than multiplying that total.

The main progression uses actual mission acceptance and destination settlement twice before unlocking the route, not supplied trust. It covers all three legs, Save at pending and running boundaries, once-only saved reward, repeat offers, hold/board conditions, missing and short freight, failure, expiry and abandonment. Travel, docking and elapsed time are controlled fixture inputs, not a player-flown journey or rendered UI acceptance.

Independent review caught an accidental undefined clinic reference in the generic field-contract builder. It was reverted and the ordinary risk suite verifies the corrected path. An incomplete-audit virtual risk invocation is excluded; an identical locally mapped public test with complete effective module evidence replaces it. Rejected attempts remain preserved.

Final effective union:1,053ESM URLs, manifest6a4e3b44062dcc02b854045c1ee11e3db13ef46bf1dbeeecdb9f1117c1458aa6. Relative to the prior qualified937graph, only the three intended source blobs change; new inputs are tests. This is loaded-source qualification, not an unrestricted filesystem/native dependency audit.

Final source blobs:
- economyContracts9102a76bb36c58e409cec0ebf92896b7255b7240
- fenceContact8a984be0d74999c59140614fb8dc35305a5c4c6f
- fenceDeskf2abda766369ff5e84e22c3d6286d03f1f2b6e7c
- new clinic test34026570a0d8699f2904893e4d8fd0be56051899
- compatibility testa6b24dffb37f2a1920f58b441d1604115c21878e

## Delivery and remaining acceptance
This is a coherent follow-up to PR532, not a competing clinic implementation. The original carrier-trust report remains valid historical evidence for its exact earlier source. The new named gate runs the15clinic and33compatibility cases; the original10case carrier-trust gate remains registered. Preserve independent package gates from other branches during later integration.

Source, tests, review and publication do not close native flight, visual quality, performance or whole-sector acceptance. All larger game, living-world and sector-coherence goals stay open.
