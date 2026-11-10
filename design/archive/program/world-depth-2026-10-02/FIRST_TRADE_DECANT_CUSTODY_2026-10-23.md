<!-- LIFETIME: DURABLE -->
# Station Decant protects the first-trade manifest

## Ordinary route and reproduced consequence
The authored first trade sends eight Fuel Cells from Helios to Ceres. Accepting the real offer creates the existing sealed cargo claim; the tutorial asks the pilot to hold that manifest, dock and collect. In-flight Crack already respects the cargo owner's sellable quantity. Station Decant instead counted total held cells.

Using the actual mission and station-service owners, Decant consumed four reserved cells and produced96tank units. At Ceres the mission correctly accepted a short delivery: four of eight delivered, four written off,380credits posted. The no-Decant control delivered all eight for760credits. The defect is unintended loss through the station service, not an impossible mission completion or a faulty partial-delivery policy.

## Implemented repair
stationServices imports the existing sellableCargoQty reader and caps Decant by its whole unreserved cells, the existing eight-cell limit, and remaining tank room. removeCargo remains the withdrawal authority. No contract ledger, claim schema, mission, economy, payout, cargo owner or pump authority changes.

When carried stock has no whole unreserved cells, the existing service request emits: “No unreserved whole fuel cells are available to decant.” This is a refusal, not a debit, cargo burn, fuel grant or claim rewrite. Existing empty-hold, full-tank, booked-pump-room and ordinary free-cell behavior remain.

The active station UI owner is not edited. Its carried-stock button may still be shown for sealed stock; this patch makes that request safely refuse with a truthful message. Button-state polish and visual acceptance remain open rather than being claimed from these tests.

## Evidence and review
Public93706e9ff07563af29461ea4b4d65486b710ee7d source baseline92a588a0d136e86247f37f5de810e3e2b82ffb78.
Final source2537afe3ecea25fe28e66fb61bc5adaad83a81f3; focused testf9863d9f29eb1d91261a51ddbb516955a73e1801.

- Matched focused baseline:6pass,6fail. Candidate:12/12.
- Existing yard service suite:15/15; existing dock gate suite:5/5.
- Total32distinct passing cases on final source. Independent reviewer/root reruns overlap; final copy was separately rerun by review.
- Independent parameterized review covers5,404 custody/pump/status combinations, not5,404 independent feature tests.

The real first-trade offer, mission acceptance, delivery and Save owners are exercised. Save/Continue checks re-dock after load and assert the custody refusal reason, not the unrelated not-docked refusal. Mixed purchased surplus remains spendable while sealed stock stays intact. Explicit, legacy-counted, legacy-ambiguous, partially delivered, sibling and persistent claims keep their existing semantics. Abandonment and expiry are handled by the existing mission owner, removing its eight cells while purchased surplus remains available. Completed delivery likewise leaves surplus usable. An unrelated real four-cell cargo loss still yields380credits under the unchanged short-delivery policy.

Review caught and corrected initially vacuous Save assertions and an empty-hold abandonment fixture; the revised tests use actual re-docking and purchased surplus. A fractional-only0.5-cell stock exits earlier with no_cells, so that suspected toast case was not a reproduced gameplay bug; the final whole-cell wording is simply more precise. Meaningful rejected attempts are retained.

Source qualification uses the current public loaded graph with unrelated Nyx/Rhea candidate flags disabled. Matched primary graphs contain1,012modules and differ only in stationServices. Accepted union:1,014ESM URLs, manifest8f989ef5234bd3a6182167cc5c7c907ab9abfa101f91bafd7942bcbe3a3c2965. This is not a complete arbitrary filesystem audit, native player flight, full production boot, live game-camera or performance acceptance.

## Ownership and delivery
Only stationServices.js, the new focused test, one named package gate and this report are owned. Fresh07:29 filename checks across49openPRs found no source overlap. Active stationApp, mission, cargo and economy owners remain untouched. Preserve all independent package gates during later integration. All larger game, sector and living-world goals stay open; published, integrated and accepted states are distinct.
