# CR-FEED: a shell comes back from the quench

## Actual scene, not another route label
After Scale 4, the ordinary Book 1 worksite sends the pilot to the infested hauler and three finite quarantine disposal lots. The furnace already destroys accepted lots and records disposal, but the immediate yard did not leave a small physical consequence the player could use. This increment returns **one cooled empty casing** after all three authored loads are actually accepted. The pilot can fly over and recover its **two scrap units through normal collection**, tow/use the physical shell, leave it, or burn it again. There is no cash grant or free repeated stock.

The thematic distinction is deliberate: the quarantine ore is destroyed; a casing, not purified ore, emerges from the quench. The physical return is one 20t industrial payload carrying two scrap units, not a model-production request or a new independent market. Its commodity amount and physical body mass remain separate existing concepts.

## Current ownership and exact scope
Fresh origin/master `f95de0eb1ba7560839209936afba48c7b96fe41a`. Current NOW was re-read, including new Lane 5 W1/stationContacts and Lane 2 reservations. Parent approved the exact disjoint write set before editing:
- `src/systems/furnaceIntake.js`: isolated before/after canonical receipt hooks plus pending issue pass. Before `/tmp/furnaceIntake.before-casing.js`; patch `/tmp/furnaceIntake.casing.increment.patch`.
- New `src/missions/furnaceCasingReturn.js`.
- New `test/furnace-casing-return.test.mjs`.
- This note.

Prior furnace receiving-lane changes are preserved, including `furnaceReceivingLane.js`. Mission core, encounter data, Lane B, held files, foreign work and the separately frozen Scale 4 publication scope are untouched. No publication/worktree/merge/deployment/model production.

## Source authority and finite inventory
The intake asks `furnaceReceiptMatches` about the actual current third body while `_furnaceTaken` is set, before emitting its ordinary receipt. The candidate requires exactly two other received lots, no lost lot and a valid authored ledger. Only after the actual receipt dispatch has marked all three lots received does the return become pending. Generic rock, invalid/lost lots and an unaccepted receipt cannot authorize it. This does not infer disposal from a bare event, mission completion flag or old saved ending; there is no retroactive stock for already completed saves.

The pending return chooses a bounded outside-mouth west pocket, rejecting occupied endpoint envelopes against current entities and dressing. No clear endpoint means no stock yet. Explicit null spawn keeps it pending for a later retry. The payload uses the established `spawnPayloadEntity` seam with `cut_panel`, persistent flags, home sector, exact stable material/mission keys and the ordinary salvage pool. Once issued, a missing, collected, destroyed or burned casing never remints. Existing matching pending material is adopted rather than duplicated.

Independent review found a real callback hazard in the first implementation: canonical spawn emits `entity:spawned` before returning, so a callback could collect it and reenter issuance before the latch was written. The corrected code reserves persisted `issuing` state **before** spawning. Reentry or a saved in-flight reservation fails closed as issued. An explicitly null result safely returns to pending; an uncertain thrown outcome records `spawnFault` and stays issued rather than risk duplicate inventory. Such an exceptional failure can forgo the optional casing; it does not block the contract. Normal collection has no new inventory writer.

## Existing visual
The actual `packagedPropSpec` resolves this ordinary industrial payload to **`pods/pod_cargo_container.glb`**, already present at `assets/ships/release/parts/pods/pod_cargo_container.glb`; this is asserted in the test. The existing visualFactory payload body is the normal fallback. There is no invented file/asset reference and no model edit. This confirms the source mapping and release asset identity, not a fresh rendered screenshot or scale/readability acceptance.

## Tests and actual play evidence
Nine focused tests; **27/27 combined author and independent read-only review pass**. Final evidence approved within stated limits; source/test hashes match the reviewed snapshot.

```
node --test test/furnace-casing-return.test.mjs test/furnace-receiving-lane.test.mjs test/ceres-furnace-aftermath.test.mjs test/w533-books-0-2.test.mjs test/mission-log-book1-continuity.test.mjs
```

Coverage includes actual mission-owned three-lot receipt settlement, zero return before the third, generic/lost/suppressed receipt rejection, blocked/null spawn retry, once-only ordinary two-scrap collection, persistent moved-body plus story restore into a fresh simulation, no remint after collection/missing body, pending-body adoption, actual visual selection, re-burning the casing, canonical spawn-callback collection/reentry, saved in-flight reservation, and uncertain spawn fault.

The native recovery probe first places the three authored disposal bodies at the mouth as an explicit fixture and lets the actual intake and mission receipt owners accept them. **It does not claim three naturally flown or thrown disposal runs.** After that, the new return is production-spawned at its bounded outside pocket. Real Pelican flight approaches it; ordinary mining/cargo collection takes two scrap. Native result: **48.8833 simulation seconds, zero pilot/casing impacts, actual Rapier mass 20t, two scrap units recovered once, no credit grants during recovery**. The existing mission payout, if any, belongs to the preceding disposal transaction, not this casing pickup; the recovery observation begins after disposal.

A real saver-boundary test serializes entity and story, restores the moved persistent casing into a fresh simulation using `_spawnPersistentEntities`, verifies exactly one casing at its saved pose, collects it and verifies no reissue after `save:loaded`. This is stronger than flag-only cloning, but still not disk/UI Continue or an entire mission session restore. The in-flight callback-save test separately verifies that an already collected shell cannot remint from the saved reservation.

Initial test scaffolding tried a nonexistent mission `destroy` method to suppress receipt handling; corrected by suppressing only the tested receipt delivery. No gameplay law was changed to satisfy that fixture.

## Acceptance limits
Source-integrated physical interaction, not published or user accepted. Endpoint clearance checks are not a swept corridor proof and the native world is a mission/disposal fixture, not the full populated refinery with all ambient actors. No rendered/audio approval, full three-lot pilot disposal route, disk/UI Continue, or full campaign acceptance is claimed. Exceptional ambiguous spawn failure intentionally sacrifices this optional small return rather than duplicate inventory. All larger game goals remain open.
